import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "pg";
import { createBackup, applyRetention, verifyBackupFile, sha256File } from "../../../scripts/backup/backup";
import { compareDatabases } from "../../../scripts/backup/compare-databases";
import { runRestoreDrill } from "../../../scripts/backup/restore-drill";
import { withDatabase } from "../../../scripts/backup/pg-env";
import { LAST_KYSELY_MIGRATION, MIGRATIONS_FOLDER, runMigrations } from "../../../src/migrations/run-migrations";

// OPS-1: نسخ حقيقي بـpg_dump واسترجاع حقيقي بـpg_restore على نفس سيرفر Postgres بتاع الاختبارات
describe("backup + restore drill (pg_dump/pg_restore حقيقي)", () => {
  const serverUrl = process.env.DATABASE_URL as string;
  const sourceDb = `satamoni_neo_backup_src_${Date.now()}`;
  const emptyDb = `${sourceDb}_empty`;
  const sourceUrl = withDatabase(serverUrl, sourceDb);
  const emptyUrl = withDatabase(serverUrl, emptyDb);
  let admin: Client;
  let dir: string;

  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  const migrationCount: number = journal.entries.length;

  // A database from before the switch to Drizzle: the baseline schema only (later migrations did not exist yet) plus the Kysely migrator's bookkeeping table at 058,
  // and no Drizzle journal (the same simulation as baseline-adoption.spec.ts).
  async function makePreDrizzleDatabase(url: string) {
    const baselineOnly = path.join(dir, "baseline-only-migrations");
    fs.cpSync(MIGRATIONS_FOLDER, baselineOnly, { recursive: true });
    fs.writeFileSync(path.join(baselineOnly, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    await runMigrations(url, baselineOnly);
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      await db.query("DROP SCHEMA drizzle CASCADE");
      await db.query("CREATE TABLE kysely_migration (name varchar(255) PRIMARY KEY, timestamp varchar(255) NOT NULL)");
      await db.query("INSERT INTO kysely_migration VALUES ($1, now()::text)", [LAST_KYSELY_MIGRATION]);
    } finally {
      await db.end();
    }
  }

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-backup-test-"));
    admin = new Client({ connectionString: withDatabase(serverUrl, "postgres") });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${sourceDb}"`);
    await admin.query(`CREATE DATABASE "${emptyDb}"`);

    // نسخة "قديمة": ناقصها آخر migration بواحدة - زي نسخة امبارح قبل deploy النهارده. أقدم نسخة ممكنة دلوقتي هي نسخة من
    // قبل التحويل لـDrizzle (تاريخ Kysely لحد 058 من غير journal بتاع Drizzle): التمرين لازم يكمّلها بالـbaseline
    await makePreDrizzleDatabase(sourceUrl);
    const src = new Client({ connectionString: sourceUrl });
    await src.connect();
    await src.query(`INSERT INTO branches (name) VALUES ('فرع-نسخة-احتياطية-جست')`);
    await src.end();

    await runMigrations(emptyUrl);
  }, 120000);

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${sourceDb}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${emptyDb}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("نسخة قديمة بتتسترجع وبتتحدّث لآخر migration والتمرين بينجح وبينضّف وراه", async () => {
    const file = await createBackup(sourceUrl, dir);
    expect(fs.statSync(file).size).toBeGreaterThan(1024);

    const report = await runRestoreDrill({ serverUrl, backupFile: file });
    const failed = report.steps.filter((s) => !s.ok);
    expect(failed).toEqual([]);
    expect(report.success).toBe(true);
    const migrationStep = report.steps.find((s) => s.step.includes("migration"));
    // no Drizzle journal in a pre-Drizzle backup, so every migration counts as pending (the baseline is recorded, not run)
    expect(migrationStep?.detail).toContain(`اتطبّق ${migrationCount} `);

    const left = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [report.scratchDatabase]);
    expect(left.rows).toHaveLength(0);
  }, 120000);

  test("نسخة من قاعدة فاضية بتفشل التمرين (مش بتعدّي كأنها سليمة)", async () => {
    const emptyDir = path.join(dir, "empty");
    const file = await createBackup(emptyUrl, emptyDir);
    const report = await runRestoreDrill({ serverUrl, backupFile: file });
    expect(report.success).toBe(false);
    expect(report.steps.find((s) => s.step.includes("بيانات حقيقية"))?.ok).toBe(false);
  }, 120000);

  test("سياسة الاحتفاظ بتتطبّق على ملفات حقيقية في المجلد", () => {
    const retentionDir = path.join(dir, "retention");
    fs.mkdirSync(retentionDir);
    // نافذة يومية 10 أيام: 09-25 جوّاها. 09-01 و09-05 برّاها في نفس الشهر - الأقدم (09-01) بس بيتحفظ
    const files = [
      "satamoni-neo-20260901-030000.dump",
      "satamoni-neo-20260905-030000.dump",
      "satamoni-neo-20260925-030000.dump",
      "manual.dump",
    ];
    for (const f of files) fs.writeFileSync(path.join(retentionDir, f), "x");

    const deleted = applyRetention(retentionDir, new Date("2026-09-29T12:00:00Z"), { dailyDays: 10, monthlyMonths: 12 });
    expect(deleted).toEqual(["satamoni-neo-20260905-030000.dump"]);
    expect(fs.readdirSync(retentionDir).sort()).toEqual([
      "manual.dump",
      "satamoni-neo-20260901-030000.dump",
      "satamoni-neo-20260925-030000.dump",
    ]);
  });

  // ---- BL-13 (Phase 3.1) ----
  test("backup writes a sha256 sidecar, verifyBackupFile passes, and a corrupted copy is rejected", async () => {
    const d = path.join(dir, "integrity");
    const file = await createBackup(sourceUrl, d);
    expect(fs.existsSync(`${file}.sha256`)).toBe(true);
    expect(fs.readFileSync(`${file}.sha256`, "utf8")).toContain(sha256File(file));
    const ok = await verifyBackupFile(file);
    expect(ok.entries).toBeGreaterThan(10);

    const corrupted = path.join(d, "satamoni-neo-20200101-000000.dump");
    const bytes = fs.readFileSync(file);
    fs.writeFileSync(corrupted, bytes.subarray(0, Math.floor(bytes.length / 2))); // truncated archive
    await expect(verifyBackupFile(corrupted)).rejects.toThrow();

    const tampered = path.join(d, "satamoni-neo-20200102-000000.dump");
    fs.writeFileSync(tampered, bytes);
    fs.writeFileSync(`${tampered}.sha256`, `${"0".repeat(64)}  x\n`);
    await expect(verifyBackupFile(tampered)).rejects.toThrow(/sha256/);
  }, 120000);

  test("restore drill compares the restored copy with the source on critical data (exact + tolerant modes)", async () => {
    const d = path.join(dir, "compare");
    const file = await createBackup(sourceUrl, d);
    const exact = await runRestoreDrill({ serverUrl, backupFile: file, compareSourceUrl: sourceUrl, allowSameServerAsSourceForTests: true });
    expect(exact.steps.filter((s) => !s.ok)).toEqual([]);
    const cmpStep = exact.steps.find((s) => s.step.includes("مقارنة"));
    expect(cmpStep?.ok).toBe(true);

    // the live source grows after the snapshot: exact mode must FAIL, tolerant (live) mode must PASS
    const src = new Client({ connectionString: sourceUrl });
    await src.connect();
    await src.query(`INSERT INTO branches (name) VALUES ('فرع-بعد-النسخة')`);
    await src.end();
    const exactAfter = await runRestoreDrill({ serverUrl, backupFile: file, compareSourceUrl: sourceUrl, allowSameServerAsSourceForTests: true });
    expect(exactAfter.success).toBe(false);
    expect(exactAfter.steps.find((s) => s.step.includes("مقارنة"))?.detail).toContain("branches");
    const tolerant = await runRestoreDrill({ serverUrl, backupFile: file, compareSourceUrl: sourceUrl, tolerateSourceGrowth: true, allowSameServerAsSourceForTests: true });
    expect(tolerant.success).toBe(true);

    // direct comparator: restored data that has FEWER rows than the source is never tolerated in reverse
    const rev = await compareDatabases(emptyUrl, sourceUrl, { tolerateSourceGrowth: true });
    expect(rev.ok).toBe(false);
  }, 240000);

  test("retention deletes the sha256 sidecar together with an expired dump", () => {
    const d = path.join(dir, "retention-sidecar");
    fs.mkdirSync(d);
    for (const f of ["satamoni-neo-20260901-030000.dump", "satamoni-neo-20260905-030000.dump"]) {
      fs.writeFileSync(path.join(d, f), "x");
      fs.writeFileSync(path.join(d, `${f}.sha256`), "x");
    }
    applyRetention(d, new Date("2026-09-29T12:00:00Z"), { dailyDays: 10, monthlyMonths: 12 });
    expect(fs.readdirSync(d).sort()).toEqual(["satamoni-neo-20260901-030000.dump", "satamoni-neo-20260901-030000.dump.sha256"]);
  });
});
