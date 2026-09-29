import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fsp } from "node:fs";
import { Client, Pool } from "pg";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from "kysely";
import { createBackup, applyRetention } from "../../../scripts/backup/backup";
import { runRestoreDrill } from "../../../scripts/backup/restore-drill";
import { withDatabase } from "../../../scripts/backup/pg-env";

// OPS-1: نسخ حقيقي بـpg_dump واسترجاع حقيقي بـpg_restore على نفس سيرفر Postgres بتاع الاختبارات
describe("backup + restore drill (pg_dump/pg_restore حقيقي)", () => {
  const serverUrl = process.env.DATABASE_URL as string;
  const sourceDb = `satamoni_neo_backup_src_${Date.now()}`;
  const emptyDb = `${sourceDb}_empty`;
  const sourceUrl = withDatabase(serverUrl, sourceDb);
  const emptyUrl = withDatabase(serverUrl, emptyDb);
  let admin: Client;
  let dir: string;

  const provider = new FileMigrationProvider({ fs: fsp, path, migrationFolder: path.join(__dirname, "../../../src/migrations/files") });

  async function migrate(url: string, upTo?: string) {
    const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: url, max: 1 }) }) });
    try {
      const migrator = new Migrator({ db, provider });
      const { error } = upTo ? await migrator.migrateTo(upTo) : await migrator.migrateToLatest();
      if (error) throw error;
    } finally {
      await db.destroy();
    }
  }

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-backup-test-"));
    admin = new Client({ connectionString: withDatabase(serverUrl, "postgres") });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${sourceDb}"`);
    await admin.query(`CREATE DATABASE "${emptyDb}"`);

    // نسخة "قديمة": متحدّثة لحد قبل آخر migration بواحدة - زي نسخة امبارح قبل deploy النهارده
    const names = Object.keys(await provider.getMigrations()).sort();
    await migrate(sourceUrl, names[names.length - 2]);
    const src = new Client({ connectionString: sourceUrl });
    await src.connect();
    await src.query(`INSERT INTO branches (name) VALUES ('فرع-نسخة-احتياطية-جست')`);
    await src.end();

    await migrate(emptyUrl);
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
    expect(migrationStep?.detail).toContain("اتطبّق 1");

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
});
