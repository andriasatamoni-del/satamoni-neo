#!/usr/bin/env node
// One-command dev runner: `pnpm dev` at the repo root.
//
// Starts the local Postgres (docker compose) and runs migrations, then the
// backend (nest --watch); in parallel the frontend (vite) and a frontend
// typecheck in watch mode (vite itself does not typecheck). Prints their
// output with a prefix, and serves a small dashboard that shows each one's
// status, errors and logs. No dependencies: Node built-ins only.
//
// DEV_SKIP_DOCKER=1 skips `docker compose up` (use your own Postgres from
// DATABASE_URL); migrations still run.

import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync } from "node:fs";

const DASHBOARD_PORT = Number(process.env.DEV_DASHBOARD_PORT || 4300);
const MAX_LINES = 2000;
const isWin = process.platform === "win32";

const BACKEND = "pnpm --filter satamoni-neo-backend";
const FRONTEND = "pnpm --filter satamoni-neo-frontend";
const skipDocker = /^(1|true)$/i.test(process.env.DEV_SKIP_DOCKER || "");

const SERVICES = [
  {
    id: "database",
    label: "Database (Postgres)",
    color: 34,
    note: skipDocker ? "external DATABASE_URL" : "docker · localhost:5432",
    // One-shot: start the container, wait for its healthcheck, apply migrations, exit.
    oneShot: true,
    command: skipDocker ? `${BACKEND} migrate` : `docker compose up -d --wait postgres && ${BACKEND} migrate`,
    detect(line, s) {
      if (/Running migrations/i.test(line)) return setState(s, "building");
      if (/Cannot connect to the Docker daemon|error during connect|docker.*not recognized|dockerDesktopLinuxEngine/i.test(line)) {
        recordError(s, "Docker is not running. Start Docker Desktop, then press restart.");
      } else if (/port is already allocated|address already in use/i.test(line)) {
        recordError(s, "Port 5432 is taken (another Postgres?). Stop it, or set DEV_SKIP_DOCKER=1 to use it instead.");
      }
      if (/❌|\bfailed\b|\bERROR\b|^\s*Error:/.test(line)) {
        recordError(s, line);
        setState(s, "error");
      }
    },
  },
  {
    id: "backend",
    label: "Backend (NestJS)",
    color: 36,
    url: `http://localhost:${process.env.PORT || 4100}`,
    dependsOn: "database",
    command: `${BACKEND} start:dev`,
    // Each rule runs against one ANSI-stripped output line.
    detect(line, s) {
      if (/File change detected|Starting compilation/i.test(line)) return setState(s, "building");
      const found = line.match(/Found (\d+) errors?\b/i);
      if (found) {
        s.buildErrors = Number(found[1]);
        return setState(s, s.buildErrors ? "error" : "starting");
      }
      if (/Nest application successfully started/i.test(line)) return setState(s, "running");
      if (/\berror TS\d+|\bERROR\b|UnhandledPromiseRejection|^\s*Error:/.test(line)) {
        recordError(s, line);
        setState(s, "error");
      }
    },
  },
  {
    id: "frontend",
    label: "Frontend (Vite)",
    color: 35,
    url: "http://localhost:5173",
    command: `${FRONTEND} dev`,
    detect(line, s) {
      if (/ready in/i.test(line)) return setState(s, "running");
      if (/hmr update|page reload/i.test(line) && s.state === "error") return setState(s, "running");
      if (/\[vite\].*error|Internal server error|Pre-transform error|failed to load|EADDRINUSE/i.test(line)) {
        recordError(s, line);
        setState(s, "error");
      }
    },
  },
  {
    id: "types",
    label: "Frontend types (tsc)",
    color: 33,
    url: null,
    command: `${FRONTEND} exec tsc --noEmit --watch --preserveWatchOutput --pretty false`,
    detect(line, s) {
      if (/Starting compilation|File change detected/i.test(line)) {
        s.errors = [];
        return setState(s, "building");
      }
      const found = line.match(/Found (\d+) errors?\b/i);
      if (found) {
        s.buildErrors = Number(found[1]);
        return setState(s, s.buildErrors ? "error" : "running");
      }
      if (/\berror TS\d+/.test(line)) recordError(s, line);
    },
  },
];

// ---------- state ----------

const state = Object.fromEntries(
  SERVICES.map((svc) => [
    svc.id,
    { id: svc.id, label: svc.label, url: svc.url ?? null, note: svc.note ?? null, state: svc.dependsOn ? "waiting" : "starting", buildErrors: 0, errors: [], logs: [], restarts: 0, pid: null },
  ]),
);
const children = new Map();
const clients = new Set();

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

function setState(s, next) {
  if (s.state === next) return;
  s.state = next;
  if (next === "building") s.errors = [];
  const svc = SERVICES.find((x) => x.id === s.id);
  console.log(`\x1b[1m\x1b[${svc.color}m[${s.id}]\x1b[0m \x1b[1mstatus → ${badge(next)}\x1b[0m`);
  broadcast({ type: "status", service: summary(s) });
}

function recordError(s, line) {
  s.errors.push(line.trim());
  if (s.errors.length > 50) s.errors.shift();
  broadcast({ type: "status", service: summary(s) });
}

function badge(st) {
  const c = { running: 32, ready: 32, error: 31, crashed: 31, building: 33, starting: 33, waiting: 90, stopped: 90 }[st] ?? 0;
  return `\x1b[${c}m${st.toUpperCase()}\x1b[0m`;
}

function summary(s) {
  const { logs, ...rest } = s;
  return rest;
}

function broadcast(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(data);
}

// ---------- processes ----------

function start(svc) {
  const s = state[svc.id];
  s.state = "starting";
  s.errors = [];
  s.buildErrors = 0;
  broadcast({ type: "status", service: summary(s) });

  // Commands are fixed strings above; a shell runs them (pnpm is a .cmd shim on
  // Windows, and the database step chains two commands with &&).
  const child = spawn(svc.command, {
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWin, // own process group, so kill() can signal the whole tree
  });
  s.pid = child.pid;
  children.set(svc.id, child);

  let buf = "";
  const onData = (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const raw of lines) handleLine(svc, raw);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("exit", (code) => {
    if (buf) handleLine(svc, buf);
    if (children.get(svc.id) !== child) return; // replaced by a restart
    children.delete(svc.id);
    s.pid = null;
    if (shuttingDown) return;
    if (code !== 0) {
      recordError(s, `process exited with code ${code}`);
      if (svc.oneShot) blockDependents(svc.id);
      return setState(s, svc.oneShot ? "error" : "crashed");
    }
    if (!svc.oneShot) return setState(s, "stopped");
    setState(s, "ready");
    // Start (or restart, e.g. after re-running migrations) whatever waits on this.
    for (const dep of SERVICES.filter((x) => x.dependsOn === svc.id)) {
      if (children.has(dep.id)) restart(dep.id);
      else start(dep);
    }
  });
}

function blockDependents(id) {
  for (const dep of SERVICES.filter((x) => x.dependsOn === id && !children.has(x.id))) {
    const d = state[dep.id];
    d.errors = [`waiting for ${id}: fix it and press restart there`];
    setState(d, "waiting");
  }
}

function handleLine(svc, raw) {
  const line = stripAnsi(raw);
  if (!line.trim()) return;
  process.stdout.write(`\x1b[${svc.color}m[${svc.id}]\x1b[0m ${raw.replace(/\r/g, "")}\n`);
  const s = state[svc.id];
  s.logs.push(line);
  if (s.logs.length > MAX_LINES) s.logs.shift();
  svc.detect(line, s);
  broadcast({ type: "log", id: svc.id, line });
}

function kill(id) {
  const child = children.get(id);
  if (!child) return;
  children.delete(id);
  try {
    // pnpm -> nest/vite -> node: kill the whole tree.
    if (isWin) execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
}

function restart(id) {
  const svc = SERVICES.find((x) => x.id === id);
  if (!svc) return;
  kill(id);
  state[id].restarts++;
  state[id].logs.push(`──── restarted ────`);
  start(svc);
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping dev processes…");
  for (const id of [...children.keys()]) kill(id);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------- dashboard ----------

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ type: "init", services: Object.values(state) })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (url.pathname === "/restart" && req.method === "POST") {
    restart(url.searchParams.get("id"));
    res.writeHead(204).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

server.on("error", (err) => {
  console.error(`Dashboard could not listen on :${DASHBOARD_PORT} (${err.code}). Set DEV_DASHBOARD_PORT to change it.`);
  if (err.code === "EADDRINUSE") console.error("Is `pnpm dev` already running in another terminal?");
  process.exit(1);
});
server.listen(DASHBOARD_PORT, () => {
  console.log(`\n\x1b[1m  Dev dashboard → http://localhost:${DASHBOARD_PORT}\x1b[0m\n`);
  // First run on a fresh clone: the backend needs backend/.env, and the example
  // already points at the docker database.
  if (!existsSync("backend/.env") && existsSync("backend/.env.example")) {
    copyFileSync("backend/.env.example", "backend/.env");
    console.log("Created backend/.env from backend/.env.example\n");
  }
  SERVICES.filter((svc) => !svc.dependsOn).forEach(start);
});

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>satamoni-neo dev</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --line:#262b36; --fg:#e6e8ee; --muted:#8a93a6;
          --ok:#3fb950; --warn:#d29922; --err:#f85149; --off:#6e7681; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui,sans-serif; height:100vh; display:flex; flex-direction:column }
  header { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--line) }
  header h1 { font-size:15px; margin:0; font-weight:600 }
  #overall { margin-left:auto; font-size:13px; color:var(--muted) }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; padding:12px 16px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px; cursor:pointer }
  .card.active { outline:2px solid #4c8dff }
  .row { display:flex; align-items:center; gap:8px }
  .name { font-weight:600 }
  .pill { margin-left:auto; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; text-transform:uppercase; letter-spacing:.04em }
  .running { background:#3fb95022; color:var(--ok) } .error,.crashed { background:#f8514922; color:var(--err) }
  .building,.starting { background:#d2992222; color:var(--warn) } .stopped,.waiting { background:#6e768122; color:var(--off) } .ready { background:#3fb95022; color:var(--ok) }
  .meta { margin-top:6px; font-size:12px; color:var(--muted); display:flex; gap:10px; align-items:center }
  .meta a { color:#79a8ff } .meta button { margin-left:auto; background:none; border:1px solid var(--line); color:var(--fg); border-radius:6px; padding:2px 8px; cursor:pointer; font-size:12px }
  .errs { margin-top:8px; font:12px ui-monospace,Consolas,monospace; color:var(--err); max-height:90px; overflow:auto; white-space:pre-wrap; word-break:break-word }
  .logbar { display:flex; gap:8px; align-items:center; padding:0 16px 8px; font-size:13px; color:var(--muted) }
  .logbar label { display:flex; gap:4px; align-items:center }
  #log { flex:1; margin:0 16px 16px; background:#0a0c10; border:1px solid var(--line); border-radius:8px; overflow:auto; padding:10px; font:12px/1.5 ui-monospace,Consolas,monospace; white-space:pre-wrap; word-break:break-word }
  #log .e { color:var(--err) } #log .w { color:var(--warn) }
</style></head><body>
<header><h1>satamoni-neo · dev</h1><span id="overall">connecting…</span></header>
<div class="cards" id="cards"></div>
<div class="logbar"><span id="logtitle"></span><label><input type="checkbox" id="onlyErr"> errors only</label><label><input type="checkbox" id="follow" checked> follow</label></div>
<pre id="log"></pre>
<script>
  const services = {}, logs = {};
  let active = "backend";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));
  const isErr = (l) => /error|exception|failed|crash|exited with code/i.test(l) && !/Found 0 errors/i.test(l);
  const isWarn = (l) => /warn/i.test(l);

  function renderCards() {
    $("cards").innerHTML = Object.values(services).map((s) => {
      const n = s.state === "error" || s.state === "crashed" ? (s.buildErrors || s.errors.length) : 0;
      return '<div class="card ' + (s.id === active ? "active" : "") + '" data-id="' + s.id + '">' +
        '<div class="row"><span class="name">' + esc(s.label) + '</span><span class="pill ' + s.state + '">' + s.state + '</span></div>' +
        '<div class="meta">' + (s.url ? '<a href="' + s.url + '" target="_blank">' + s.url + '</a>' : '<span>' + esc(s.note || "watch mode") + '</span>') +
        (n ? '<span style="color:var(--err)">' + n + ' error' + (n > 1 ? "s" : "") + '</span>' : "") +
        '<button data-restart="' + s.id + '">restart</button></div>' +
        (s.errors.length && (s.state === "error" || s.state === "crashed" || s.state === "waiting") ? '<div class="errs">' + esc(s.errors.slice(-5).join("\\n")) + '</div>' : "") +
        '</div>';
    }).join("");
    const list = Object.values(services);
    const bad = list.filter((s) => s.state === "error" || s.state === "crashed").length;
    const busy = list.filter((s) => s.state === "building" || s.state === "starting").length;
    $("overall").textContent = bad ? bad + " with errors" : busy ? "starting…" : "all good";
    $("overall").style.color = bad ? "var(--err)" : busy ? "var(--warn)" : "var(--ok)";
    document.title = (bad ? "✖ " : busy ? "… " : "✔ ") + "satamoni-neo dev";
  }

  function renderLog() {
    const lines = (logs[active] || []).filter((l) => !$("onlyErr").checked || isErr(l));
    $("logtitle").textContent = (services[active]?.label || "") + " — " + lines.length + " lines";
    $("log").innerHTML = lines.map((l) => isErr(l) ? '<span class="e">' + esc(l) + '</span>' : isWarn(l) ? '<span class="w">' + esc(l) + '</span>' : esc(l)).join("\\n");
    if ($("follow").checked) $("log").scrollTop = $("log").scrollHeight;
  }

  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderLog(); }); } };

  $("cards").addEventListener("click", (e) => {
    const r = e.target.closest("[data-restart]");
    if (r) { e.stopPropagation(); fetch("/restart?id=" + r.dataset.restart, { method: "POST" }); return; }
    const c = e.target.closest(".card");
    if (c) { active = c.dataset.id; renderCards(); renderLog(); }
  });
  $("onlyErr").onchange = renderLog;

  const es = new EventSource("/events");
  es.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === "init") {
      for (const s of m.services) { logs[s.id] = s.logs; services[s.id] = s; }
      renderCards(); renderLog();
    } else if (m.type === "status") {
      services[m.service.id] = m.service; renderCards();
    } else if (m.type === "log") {
      const arr = logs[m.id] || (logs[m.id] = []);
      arr.push(m.line); if (arr.length > ${MAX_LINES}) arr.shift();
      if (m.id === active) schedule();
    }
  };
  es.onerror = () => { $("overall").textContent = "dev runner stopped"; $("overall").style.color = "var(--off)"; document.title = "■ satamoni-neo dev"; };
</script></body></html>`;
