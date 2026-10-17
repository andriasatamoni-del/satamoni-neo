#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE = ".dev-worktree.json";
const CONTAINER = "satamoni-neo-postgres";
const PROTECTED_DATABASES = new Set(["postgres", "satamoni_neo", "satamoni_neo_test", "satamoni_legacy_fixture_test"]);
const BASE_PORTS = { backend: 4100, frontend: 5173, dashboard: 4300 };
const MAX_SLOT = 99;

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function repoRoot(cwd = process.cwd()) {
  return resolve(git("rev-parse --show-toplevel", cwd));
}

export function mainCheckoutRoot(cwd = process.cwd()) {
  return dirname(resolve(git("rev-parse --path-format=absolute --git-common-dir", cwd)));
}

export function isLinkedWorktree(cwd = process.cwd()) {
  try {
    return repoRoot(cwd) !== mainCheckoutRoot(cwd);
  } catch {
    return false;
  }
}

export function readWorktreeConfig(root = repoRoot()) {
  const file = join(root, CONFIG_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function worktreeEnv(config) {
  return {
    PORT: String(config.ports.backend),
    DATABASE_URL: config.databaseUrl,
    FRONTEND_ORIGIN: `http://localhost:${config.ports.frontend}`,
    VITE_PORT: String(config.ports.frontend),
    VITE_API_PROXY_TARGET: `http://localhost:${config.ports.backend}`,
    DEV_DASHBOARD_PORT: String(config.ports.dashboard),
  };
}

function databaseNameFor(root) {
  const slug = basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const name = slug.startsWith("satamoni_neo") ? slug : `satamoni_neo_${slug}`;
  return name.slice(0, 63);
}

function assertDisposable(database) {
  if (!/^satamoni_neo_[a-z0-9_]+$/.test(database) || PROTECTED_DATABASES.has(database)) {
    throw new Error(`Refusing to touch database "${database}": it is not a worktree database.`);
  }
}

function worktreeRoots(cwd) {
  return git("worktree list --porcelain", cwd)
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolve(line.slice("worktree ".length)));
}

function pickSlot(root) {
  const taken = new Set(
    worktreeRoots(root)
      .filter((other) => other !== root)
      .map((other) => readWorktreeConfig(other)?.slot)
      .filter(Boolean),
  );
  for (let slot = 1; slot <= MAX_SLOT; slot++) if (!taken.has(slot)) return slot;
  throw new Error("No free worktree slot left; tear down an unused worktree first.");
}

function baseEnvFile(root) {
  const fromMain = join(mainCheckoutRoot(root), "backend", ".env");
  return existsSync(fromMain) ? fromMain : join(root, "backend", ".env.example");
}

function setEnvVar(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

function envValue(text, key) {
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
}

function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function run(command, cwd) {
  const result = spawnSync(command, { cwd, shell: true, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Command failed: ${command}`);
}

function containerState() {
  try {
    return execSync(`docker inspect -f "{{.State.Running}}" ${CONTAINER}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "missing";
  }
}

export function ensureDatabaseServer(cwd = process.cwd()) {
  if (/^(1|true)$/i.test(process.env.DEV_SKIP_DOCKER || "")) return;
  const state = containerState();
  if (state === "true") return;
  if (state === "false") run(`docker start ${CONTAINER}`, cwd);
  else run("docker compose up -d --wait postgres", mainCheckoutRoot(cwd));
}

function loadPg(root) {
  return createRequire(join(root, "backend", "package.json"))("pg");
}

async function withAdminClient(root, databaseUrl, fn) {
  const { Client } = loadPg(root);
  const adminUrl = withDatabase(databaseUrl, "postgres");
  const deadline = Date.now() + 60_000;
  for (;;) {
    const client = new Client({ connectionString: adminUrl });
    try {
      await client.connect();
    } catch (error) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }
}

function assertLinkedWorktree(root) {
  if (!isLinkedWorktree(root)) {
    throw new Error("This is the main checkout; it uses the default stack. Run this inside a git worktree.");
  }
}

async function setup() {
  const root = repoRoot();
  assertLinkedWorktree(root);

  if (!existsSync(join(root, "node_modules")) || !existsSync(join(root, "backend", "node_modules"))) {
    run("pnpm install", root);
  }

  const existing = readWorktreeConfig(root);
  const slot = existing?.slot ?? pickSlot(root);
  const database = existing?.database ?? databaseNameFor(root);
  assertDisposable(database);
  const ports = {
    backend: BASE_PORTS.backend + slot,
    frontend: BASE_PORTS.frontend + slot,
    dashboard: BASE_PORTS.dashboard + slot,
  };

  const envFile = join(root, "backend", ".env");
  if (!existsSync(envFile)) copyFileSync(baseEnvFile(root), envFile);
  const baseUrl = envValue(readFileSync(envFile, "utf8"), "DATABASE_URL") ?? "postgresql://postgres:test123@localhost:5432/satamoni_neo";
  const databaseUrl = withDatabase(baseUrl, database);
  const config = { name: basename(root), slot, database, databaseUrl, ports };

  let envText = readFileSync(envFile, "utf8");
  for (const [key, value] of Object.entries({ DATABASE_URL: databaseUrl, PORT: String(ports.backend), FRONTEND_ORIGIN: `http://localhost:${ports.frontend}` })) {
    envText = setEnvVar(envText, key, value);
  }
  writeFileSync(envFile, envText);

  ensureDatabaseServer(root);
  await withAdminClient(root, databaseUrl, async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!rowCount) await client.query(`CREATE DATABASE "${database}"`);
  });
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);

  run("pnpm --filter satamoni-neo-backend migrate", root);

  console.log(`
Worktree "${config.name}" is ready (slot ${slot}).
  database  ${database}
  backend   http://localhost:${ports.backend}
  frontend  http://localhost:${ports.frontend}
  dashboard http://localhost:${ports.dashboard}

Next: pnpm seed:dev (optional), then pnpm dev.`);
}

async function teardown() {
  const root = repoRoot();
  assertLinkedWorktree(root);
  const config = readWorktreeConfig(root);
  if (!config) {
    console.log(`No ${CONFIG_FILE} here; nothing to tear down.`);
    return;
  }
  assertDisposable(config.database);

  ensureDatabaseServer(root);
  await withAdminClient(root, config.databaseUrl, (client) => client.query(`DROP DATABASE IF EXISTS "${config.database}" WITH (FORCE)`));

  rmSync(join(root, CONFIG_FILE), { force: true });
  rmSync(join(root, "backend", ".env"), { force: true });
  console.log(`Dropped database ${config.database} and removed the worktree dev config.`);
}

const commands = { setup, teardown, "db-up": async () => ensureDatabaseServer() };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2]];
  if (!command) {
    console.error(`Usage: node scripts/worktree.mjs <${Object.keys(commands).join("|")}>`);
    process.exit(1);
  }
  command().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
