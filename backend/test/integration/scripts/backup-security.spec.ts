import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { Client } from "pg";
import { createBackup } from "../../../scripts/backup/backup";
import { pgEnvFromUrl, withDatabase } from "../../../scripts/backup/pg-env";
import { assertDifferentCluster, clusterFingerprint, assertLocalRestoreTarget } from "../../../scripts/backup/restore-target-guard";
import { runRestoreDrill } from "../../../scripts/backup/restore-drill";
import { decryptVerifiedBackup, verifyEncryptedBackup } from "../../../scripts/backup/verify-encrypted-backup";

// Disposable local databases only (the integration suite's own server). The "passphrase" is random per run and never printed.
describe("backup security (local, disposable data)", () => {
  const serverUrl = process.env.DATABASE_URL as string; // the disposable integration-test database
  const srcDb = `satamoni_neo_sec_src_${Date.now()}`;
  let admin: Client;
  let dir: string;
  let gnupgHome: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-backup-sec-"));
    gnupgHome = path.join(dir, "gnupg");
    fs.mkdirSync(gnupgHome, { mode: 0o700 });
    admin = new Client({ connectionString: withDatabase(serverUrl, "postgres") });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${srcDb}"`);
    const src = new Client({ connectionString: withDatabase(serverUrl, srcDb) });
    await src.connect();
    for (let i = 1; i <= 6; i++) {
      await src.query(`CREATE TABLE t${i} (id serial PRIMARY KEY, note text NOT NULL)`);
      await src.query(`INSERT INTO t${i} (note) SELECT 'synthetic row ' || g FROM generate_series(1, 200) g`);
    }
    await src.end();
  }, 60_000);

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${srcDb}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("real pg_dump -> gpg AES-256 -> SHA-256 of the ENCRYPTED file -> verify -> decrypt -> readable by pg_restore; one flipped byte is rejected", async () => {
    const passphrase = randomBytes(36).toString("base64");
    const env = { ...process.env, GNUPGHOME: gnupgHome };
    const dump = await createBackup(withDatabase(serverUrl, srcDb), path.join(dir, "out"));
    const original = createHash("sha256").update(fs.readFileSync(dump)).digest("hex");

    // exactly the workflow's steps
    const gpgFile = `${dump}.gpg`;
    execFileSync("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--symmetric", "--cipher-algo", "AES256", "-o", gpgFile, dump], { input: passphrase, env });
    execFileSync("sh", ["-c", `cd "${path.dirname(gpgFile)}" && sha256sum "${path.basename(gpgFile)}" > "${path.basename(gpgFile)}.sha256" && sha256sum --check --strict "${path.basename(gpgFile)}.sha256"`]);
    fs.rmSync(dump);
    fs.rmSync(`${dump}.sha256`, { force: true });
    expect(fs.readdirSync(path.dirname(gpgFile)).sort()).toEqual([`${path.basename(gpgFile)}`, `${path.basename(gpgFile)}.sha256`].sort());

    await verifyEncryptedBackup(gpgFile);
    const restored = path.join(dir, "restored.dump");
    process.env.GNUPGHOME = gnupgHome;
    try {
      await decryptVerifiedBackup(gpgFile, restored, passphrase); // includes pg_restore --list on the decrypted archive
      expect(createHash("sha256").update(fs.readFileSync(restored)).digest("hex")).toBe(original);

      const bytes = Buffer.from(fs.readFileSync(gpgFile));
      bytes[Math.floor(bytes.length / 2)] ^= 0x01;
      fs.writeFileSync(gpgFile, bytes);
      await expect(verifyEncryptedBackup(gpgFile)).rejects.toThrow(/SHA-256 mismatch/);
    } finally {
      delete process.env.GNUPGHOME;
    }
  }, 120_000);

  test("verify-restore.sql: runs read-only on a disposable DB and refuses a database whose name is not restore/scratch/drill/test", () => {
    const sqlFile = path.join(__dirname, "../../../scripts/backup/verify-restore.sql");
    const psql = (db: string) => spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", sqlFile, "-d", db], { env: pgEnvFromUrl(withDatabase(serverUrl, db)), encoding: "utf8" });

    const refused = psql("postgres");
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("refuses to run");

    const dbName = decodeURIComponent(new URL(serverUrl).pathname.slice(1)); // satamoni_neo_test...
    expect(dbName).toMatch(/test/);
    const ok = psql(dbName);
    expect(ok.stderr).toBe("");
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("unbalanced_entries");
    expect(ok.stdout).toContain("stock_equals_movements");
  }, 60_000);

  test("server fingerprint: the same server reached through different names is detected (localhost vs 127.0.0.1 vs a different database name)", async () => {
    const u = new URL(serverUrl);
    const a = withDatabase(serverUrl, "postgres");
    const viaIp = new URL(a);
    viaIp.hostname = "127.0.0.1";
    expect(await clusterFingerprint(a)).toBe(await clusterFingerprint(withDatabase(viaIp.toString(), srcDb)));
    await expect(
      assertDifferentCluster(a, [{ label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: withDatabase(viaIp.toString(), srcDb) }])
    ).rejects.toThrow(/same PostgreSQL server/);
    expect(u.hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  }, 30_000);

  test("runRestoreDrill itself refuses (before touching any file or database) a remote target, and a same-server source unless the test-only switch is set", async () => {
    const remote = "postgresql://postgres:fake-password@db.prod.invalid:5432/postgres";
    await expect(runRestoreDrill({ serverUrl: remote, backupFile: "/nonexistent/file.dump" })).rejects.toThrow(/LOCAL/);
    expect(() => assertLocalRestoreTarget(serverUrl)).not.toThrow(); // the disposable integration server is local

    await expect(
      runRestoreDrill({ serverUrl, backupFile: "/nonexistent/file.dump", compareSourceUrl: withDatabase(serverUrl, srcDb) })
    ).rejects.toThrow(/same server as RESTORE_DRILL_COMPARE_SOURCE_URL/);
    // a source reachable only through a different NAME is caught at connection time
    const viaIp = new URL(serverUrl);
    viaIp.hostname = viaIp.hostname === "localhost" ? "127.0.0.1" : "localhost";
    await expect(
      runRestoreDrill({ serverUrl, backupFile: "/nonexistent/file.dump", forbiddenServerUrls: [{ label: "DATABASE_URL", url: viaIp.toString() }] })
    ).rejects.toThrow(/same server as DATABASE_URL/);
  }, 30_000);
});
