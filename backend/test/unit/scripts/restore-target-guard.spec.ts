import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  RestoreGuardError,
  assertDifferentCluster,
  assertLocalRestoreTarget,
  assertNotSameServer,
  normalizePgUrl,
  resolveRestoreDrillConfig,
} from "../../../scripts/backup/restore-target-guard";
import { pgEnvFromUrl } from "../../../scripts/backup/pg-env";

// All hosts below are fictional / reserved (.invalid, RFC 5737). No test ever opens a network connection to them: the
// guard must refuse BEFORE any connection. Passwords in the URLs are fake and must never appear in an error message.
const PW = "s3cr3t-pw-do-not-leak";
const u = (hostPart: string, db = "postgres") => `postgresql://postgres:${PW}@${hostPart}/${db}`;

const REMOTE_OR_AMBIGUOUS: Array<[string, string]> = [
  ["production-like Render host", u("dpg-abc123-a.oregon-postgres.render.com:5432", "satamoni_neo")],
  ["private network address", u("10.0.0.5:5432")],
  ["public documentation address", u("203.0.113.9:5432")],
  ["hostname that merely starts with localhost", u("localhost.evil.invalid:5432")],
  ["credentials trick (localhost as the username)", `postgresql://localhost:${PW}@evil.invalid/postgres`],
  ["nip.io style wildcard DNS", u("127.0.0.1.nip.io")],
  ["decimal-encoded IPv4", u("2130706433")],
  ["hex-encoded IPv4", u("0x7f000001")],
  ["0.0.0.0", u("0.0.0.0")],
  ["IPv4-mapped IPv6", u("[::ffff:127.0.0.1]")],
  ["127.0.0.256 (invalid octet)", u("127.0.0.256")],
  ["leading-zero octets", u("127.00.0.1")],
  ["percent-encoded host", u("loc%61lhost")],
  ["multi-host URL", u("localhost,evil.invalid")],
  ["unix socket / empty host", `postgresql:///postgres`],
  ["host override through the query string", `${u("localhost")}?host=evil.invalid`],
  ["hostaddr override", `${u("localhost")}?hostaddr=203.0.113.9`],
  ["service file override", `${u("localhost")}?service=production`],
  ["port override", `${u("localhost:5432")}?port=5433`],
  ["dbname override", `${u("localhost")}?dbname=satamoni_neo`],
  ["wrong scheme", `mysql://root:${PW}@localhost/db`],
  ["invalid port", u("localhost:99999")],
  ["not a URL", "host=localhost dbname=postgres password=" + PW],
];

describe("restore target guard: destination must be a LOCAL throw-away server", () => {
  test.each([
    ["localhost with port", u("localhost:55432")],
    ["127.0.0.1 default port", u("127.0.0.1")],
    ["127.0.0.5", u("127.0.0.5:5432")],
    ["IPv6 loopback", u("[::1]:5433")],
    ["uppercase host", u("LOCALHOST:5432")],
    ["trailing dot", u("localhost.:5432")],
    ["postgres:// scheme", `postgres://postgres:${PW}@localhost:5432/postgres`],
  ])("accepts %s", (_n, url) => {
    expect(assertLocalRestoreTarget(url).loopback).toBe(true);
  });

  test.each(REMOTE_OR_AMBIGUOUS)("rejects %s", (_n, url) => {
    expect(() => assertLocalRestoreTarget(url)).toThrow(RestoreGuardError);
  });

  test.each([[undefined], [null], [""], ["   "]])("rejects a missing address (%p)", (value) => {
    expect(() => assertLocalRestoreTarget(value as any)).toThrow(RestoreGuardError);
  });

  test("error messages never contain the password, the host or the port", () => {
    for (const [, url] of [...REMOTE_OR_AMBIGUOUS, ["", ""]] as Array<[string, string]>) {
      try {
        assertLocalRestoreTarget(url);
      } catch (err) {
        const message = String((err as Error).message);
        expect(message).not.toContain(PW);
        expect(message).not.toMatch(/render\.com|10\.0\.0\.5|203\.0\.113|evil\.invalid|55432/);
      }
    }
  });

  test("normalization: aliases of the same machine share a server key, a different port is a different server", () => {
    const a = normalizePgUrl(u("localhost:5432", "a"), "A");
    expect(normalizePgUrl(u("127.0.0.1", "b"), "B").serverKey).toBe(a.serverKey);
    expect(normalizePgUrl(u("[::1]:5432", "c"), "C").serverKey).toBe(a.serverKey);
    expect(normalizePgUrl(u("LOCALHOST.:5432", "d"), "D").serverKey).toBe(a.serverKey);
    expect(normalizePgUrl(u("localhost:5433", "a"), "E").serverKey).not.toBe(a.serverKey);
    expect(normalizePgUrl(u("db.example.invalid.", "x"), "F").serverKey).toBe(normalizePgUrl(u("DB.EXAMPLE.INVALID:5432", "y"), "G").serverKey);
  });
});

describe("restore target guard: source and destination must not be the same server", () => {
  const target = () => assertLocalRestoreTarget(u("localhost:5432", "postgres"));

  test("same host, same port, same database name -> refused", () => {
    expect(() => assertNotSameServer(target(), [{ label: "DATABASE_URL", url: u("localhost:5432", "postgres") }])).toThrow(/same server as DATABASE_URL/);
  });

  test("same server but a DIFFERENT database name -> still refused (the database name does not make it another server)", () => {
    expect(() => assertNotSameServer(target(), [{ label: "DATABASE_URL", url: u("localhost:5432", "satamoni_neo") }])).toThrow(RestoreGuardError);
  });

  test.each(["127.0.0.1:5432", "[::1]", "LOCALHOST.", "127.0.0.7"])("same server under another name (%s) -> refused", (host) => {
    expect(() => assertNotSameServer(target(), [{ label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: u(host, "other") }])).toThrow(/RESTORE_DRILL_COMPARE_SOURCE_URL/);
  });

  test("a source on another port, or a remote source, is allowed", () => {
    expect(() =>
      assertNotSameServer(target(), [
        { label: "DATABASE_URL", url: u("localhost:5433", "satamoni_neo") },
        { label: "LEGACY_DATABASE_URL", url: u("dpg-abc123-a.oregon-postgres.render.com", "legacy") },
        { label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: undefined },
        { label: "OTHER", url: "" },
      ])
    ).not.toThrow();
  });

  test("a source URL that cannot be understood fails closed (it is not silently ignored)", () => {
    expect(() => assertNotSameServer(target(), [{ label: "DATABASE_URL", url: "garbage" }])).toThrow(RestoreGuardError);
  });
});

describe("restore target guard: runtime server identity (catches aliases and tunnels the URL cannot reveal)", () => {
  const sources = [{ label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: u("db.remote.invalid", "prod") }];

  test("same fingerprint -> refused", async () => {
    await expect(assertDifferentCluster(u("localhost:55432"), sources, { fingerprint: async () => "1700000000.123456|170011" })).rejects.toThrow(/same PostgreSQL server/);
  });

  test("different fingerprint -> allowed", async () => {
    const fp = async (url: string) => (url.includes("remote.invalid") ? "1.5|170011" : "2.5|170011");
    await expect(assertDifferentCluster(u("localhost:55432"), sources, { fingerprint: fp })).resolves.toBeUndefined();
  });

  test("an unreachable source cannot be the running target: skipped with a warning, never a crash or a silent pass-through of the target check", async () => {
    const warnings: string[] = [];
    const fp = async (url: string) => {
      if (url.includes("remote.invalid")) throw new Error("ECONNREFUSED");
      return "2.5|170011";
    };
    await expect(assertDifferentCluster(u("localhost:55432"), sources, { fingerprint: fp, warn: (m) => warnings.push(m) })).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("remote.invalid");
  });

  test("an unreachable TARGET is an error (we never proceed without being able to identify the destination)", async () => {
    await expect(
      assertDifferentCluster(u("localhost:55432"), sources, {
        fingerprint: async (url: string) => {
          if (url.includes("localhost")) throw new Error("ECONNREFUSED");
          return "1|1";
        },
      })
    ).rejects.toThrow("ECONNREFUSED");
  });

  test("no sources -> nothing to compare, no connection attempted", async () => {
    const fp = jest.fn();
    await assertDifferentCluster(u("localhost:55432"), [{ label: "X", url: undefined }], { fingerprint: fp });
    expect(fp).not.toHaveBeenCalled();
  });
});

describe("restore drill configuration from the process environment", () => {
  const LOCAL = u("localhost:55432");

  test("RESTORE_DRILL_DATABASE_URL is mandatory: there is NO fallback to DATABASE_URL", () => {
    expect(() => resolveRestoreDrillConfig({})).toThrow(/RESTORE_DRILL_DATABASE_URL is required/);
    expect(() => resolveRestoreDrillConfig({ DATABASE_URL: LOCAL })).toThrow(/NO fallback to DATABASE_URL/);
    expect(() => resolveRestoreDrillConfig({ DATABASE_URL: LOCAL, RESTORE_DRILL_DATABASE_URL: "  " })).toThrow(RestoreGuardError);
  });

  test("a production / remote address in RESTORE_DRILL_DATABASE_URL is refused", () => {
    expect(() => resolveRestoreDrillConfig({ RESTORE_DRILL_DATABASE_URL: u("dpg-abc123-a.oregon-postgres.render.com", "satamoni_neo") })).toThrow(/LOCAL/);
    expect(() => resolveRestoreDrillConfig({ RESTORE_DRILL_DATABASE_URL: u("dpg-abc123-a.oregon-postgres.render.com"), DATABASE_URL: u("dpg-abc123-a.oregon-postgres.render.com") })).toThrow(/LOCAL/);
  });

  test("valid local target with unrelated sources -> accepted", () => {
    const cfg = resolveRestoreDrillConfig({
      RESTORE_DRILL_DATABASE_URL: LOCAL,
      DATABASE_URL: u("dpg-abc123-a.oregon-postgres.render.com", "satamoni_neo"),
      RESTORE_DRILL_COMPARE_SOURCE_URL: u("dpg-abc123-a.oregon-postgres.render.com", "satamoni_neo"),
      LEGACY_DATABASE_URL: u("legacy.example.invalid", "legacy"),
    });
    expect(cfg.target.port).toBe(55432);
    expect(cfg.sources.map((s) => s.label)).toEqual(["DATABASE_URL", "LEGACY_DATABASE_URL", "RESTORE_DRILL_COMPARE_SOURCE_URL"]);
  });

  test.each([
    ["DATABASE_URL on the same local server", { DATABASE_URL: u("127.0.0.1:55432", "satamoni_neo") }],
    ["LEGACY_DATABASE_URL on the same local server", { LEGACY_DATABASE_URL: u("[::1]:55432", "legacy") }],
    ["compare source on the same local server", { RESTORE_DRILL_COMPARE_SOURCE_URL: u("localhost:55432", "another_db") }],
    ["DATABASE_URL identical to the target", { DATABASE_URL: LOCAL }],
  ])("conflicting variables: %s -> refused", (_n, extra) => {
    expect(() => resolveRestoreDrillConfig({ RESTORE_DRILL_DATABASE_URL: LOCAL, ...extra })).toThrow(/same server/);
  });

  test("a garbage DATABASE_URL next to a valid target fails closed", () => {
    expect(() => resolveRestoreDrillConfig({ RESTORE_DRILL_DATABASE_URL: LOCAL, DATABASE_URL: "not-a-url" })).toThrow(RestoreGuardError);
  });

  test("libpq environment overrides (PGHOSTADDR / PGSERVICE / PGHOST) cannot redirect pg_dump/pg_restore away from the URL", () => {
    const saved = { ...process.env };
    try {
      process.env.PGHOSTADDR = "203.0.113.9";
      process.env.PGSERVICE = "production";
      process.env.PGSERVICEFILE = "/tmp/pg_service.conf";
      process.env.PGHOST = "evil.invalid";
      process.env.PGPORT = "1";
      const env = pgEnvFromUrl(u("localhost:55432", "satamoni_neo_restore_drill_1"));
      expect(env.PGHOSTADDR).toBeUndefined();
      expect(env.PGSERVICE).toBeUndefined();
      expect(env.PGSERVICEFILE).toBeUndefined();
      expect(env.PGHOST).toBe("localhost");
      expect(env.PGPORT).toBe("55432");
    } finally {
      for (const k of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGHOST", "PGPORT"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe("restore-drill CLI: backend/.env cannot bypass or redirect the guard", () => {
  const backendDir = path.join(__dirname, "../../..");
  const script = path.join(backendDir, "scripts/backup/restore-drill.ts");
  const tsNode = path.join(backendDir, "node_modules/ts-node/dist/bin.js");
  let cwd: string;

  // Runs the REAL script with a minimal explicit environment. cwd contains a .env (what dotenv would read).
  function run(env: Record<string, string>, dotenv: string) {
    fs.writeFileSync(path.join(cwd, ".env"), dotenv);
    return spawnSync(process.execPath, [tsNode, script], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, TS_NODE_PROJECT: path.join(backendDir, "tsconfig.json"), TS_NODE_TRANSPILE_ONLY: "true", ...env },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  beforeAll(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "restore-guard-cli-"));
  });
  afterAll(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test(".env defining a (valid-looking) local target is IGNORED: without the real environment variable the CLI refuses to start", () => {
    const r = run({}, `RESTORE_DRILL_DATABASE_URL=${u("localhost:55432")}\nDATABASE_URL=${u("db.prod.invalid", "satamoni_neo")}\n`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("RESTORE_DRILL_DATABASE_URL is required");
    expect(r.stderr).not.toContain(PW);
  }, 90_000);

  test(".env cannot point the drill at production either: a remote target from the real environment is refused before any connection", () => {
    const r = run({ RESTORE_DRILL_DATABASE_URL: u("db.prod.invalid", "satamoni_neo") }, `RESTORE_DRILL_DATABASE_URL=${u("localhost:55432")}\n`);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/LOCAL throw-away PostgreSQL server/);
    expect(r.stderr).not.toContain("db.prod.invalid");
    expect(r.stderr).not.toContain(PW);
  }, 90_000);

  test("a local target on the same server as DATABASE_URL (from the environment) is refused before any connection", () => {
    const r = run({ RESTORE_DRILL_DATABASE_URL: u("localhost:55432", "postgres"), DATABASE_URL: u("127.0.0.1:55432", "satamoni_neo") }, "");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/same server as DATABASE_URL/);
  }, 90_000);

  test("the restore path never imports dotenv (directly or through backup.ts) and never falls back to DATABASE_URL", () => {
    const dir = path.join(backendDir, "scripts/backup");
    for (const f of ["restore-drill.ts", "restore-target-guard.ts", "backup-verify.ts", "compare-databases.ts", "pg-env.ts", "verify-encrypted-backup.ts", "retention.ts"]) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect({ f, dotenv: /from "dotenv|import "dotenv|require\("dotenv/.test(src) }).toEqual({ f, dotenv: false });
      expect({ f, importsBackup: /from "\.\/backup"/.test(src) }).toEqual({ f, importsBackup: false });
    }
    const drill = fs.readFileSync(path.join(dir, "restore-drill.ts"), "utf8");
    expect(drill).not.toMatch(/RESTORE_DRILL_DATABASE_URL\s*\|\|\s*process\.env\.DATABASE_URL/);
    expect(drill).not.toContain("allowSameServerAsSourceForTests: true"); // the test-only switch is never set by the CLI
    expect(drill).not.toMatch(/process\.env\.[A-Z_]*ALLOW/);
  });
});
