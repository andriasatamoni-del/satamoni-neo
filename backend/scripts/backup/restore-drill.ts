import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { promises as fsp } from "node:fs";
import { Client, Pool } from "pg";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from "kysely";
import { parseBackupFiles } from "./retention";
import { backupDirFromEnv, verifyBackupFile } from "./backup-verify";
import { compareDatabases } from "./compare-databases";
import { pgEnvFromUrl, withDatabase } from "./pg-env";
import { assertDifferentCluster, assertLocalRestoreTarget, assertNotSameServer, resolveRestoreDrillConfig, type SourceRef } from "./restore-target-guard";

const execFileAsync = promisify(execFile);
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "src", "migrations", "files");

// عينة جداول أساسية من كل context رئيسي - لو أي واحد ناقص يبقى النسخة ناقصة جزء كامل
export const CORE_TABLES = [
  "users", "branches", "orders", "order_items", "inventory_items", "stock_movements", "branch_stock_balances",
  "accounts", "journal_entries", "journal_entry_lines", "employees", "purchase_orders", "goods_receipts",
  "menu_items", "customers",
];
const DATA_SAMPLE_TABLES = ["branches", "users", "orders", "journal_entries", "employees", "inventory_items"];

export interface DrillStep { step: string; ok: boolean; detail?: string }
export interface DrillReport { success: boolean; steps: DrillStep[]; backupFile: string; scratchDatabase: string }

// OPS-1: تمرين استرجاع حقيقي - نفس db/restore-drill.js في الريبو القديم، بخطوة زيادة ممكنة هنا بس لأن
// neo عنده migrations حقيقية: بعد الاسترجاع بنشغّل migrateToLatest على النسخة المسترجعة نفسها. ده بيثبت
// إن نسخة قديمة (قبل آخر migration) ممكن تتسترجع وتتحدّث للكود الحالي من غير مشاكل - بالظبط السيناريو
// الحقيقي وقت أزمة (بتسترجع نسخة أمس على كود النهارده).
export async function runRestoreDrill(input: {
  serverUrl: string;
  backupFile?: string;
  keep?: boolean;
  log?: (s: DrillStep) => void;
  // optional: compare the restored copy with this source on critical business data (BL-13)
  compareSourceUrl?: string;
  tolerateSourceGrowth?: boolean;
  // قواعد تانية (إنتاج/legacy...) الوجهة ممنوع تبقى على سيرفرها - بتتضاف لـcompareSourceUrl في فحص "نفس السيرفر"
  forbiddenServerUrls?: SourceRef[];
  // للاختبارات بس (مفيش CLI ولا متغير بيئة بيوصل له): اختبارات التكامل بتقارن بقاعدة مصدر مؤقتة على نفس سيرفر الاختبار
  allowSameServerAsSourceForTests?: boolean;
}): Promise<DrillReport> {
  // أول حاجة، قبل أي ملف أو اتصال: الوجهة لازم تكون سيرفر محلي، ومش نفس سيرفر أي مصدر
  assertLocalRestoreTarget(input.serverUrl);
  const sources: SourceRef[] = [
    ...(input.compareSourceUrl ? [{ label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: input.compareSourceUrl }] : []),
    ...(input.forbiddenServerUrls ?? []),
  ];
  if (!input.allowSameServerAsSourceForTests) {
    assertNotSameServer(assertLocalRestoreTarget(input.serverUrl), sources);
    await assertDifferentCluster(withDatabase(input.serverUrl, "postgres"), sources, {
      sourceSsl: process.env.RESTORE_DRILL_SOURCE_SSL === "true",
      warn: (message) => input.log?.({ step: "تحذير", ok: true, detail: message }),
    });
  }

  const steps: DrillStep[] = [];
  const record = (step: string, ok: boolean, detail?: string) => {
    const s = { step, ok, detail };
    steps.push(s);
    input.log?.(s);
    return ok;
  };

  let backupFile = input.backupFile;
  if (!backupFile) {
    const dir = backupDirFromEnv();
    const backups = fs.existsSync(dir) ? parseBackupFiles(fs.readdirSync(dir)) : [];
    if (backups.length === 0) throw new Error(`No backups found in ${dir}`);
    backupFile = path.join(dir, backups[backups.length - 1].name);
  }
  if (!fs.existsSync(backupFile)) throw new Error(`Backup file not found: ${backupFile}`);
  record("تحديد النسخة الاحتياطية", true, path.basename(backupFile));
  try {
    const v = await verifyBackupFile(backupFile);
    record("سلامة الملف (sha256 + فهرس pg_restore)", true, `${v.entries} عنصر، sha256=${v.sha256.slice(0, 16)}…`);
  } catch (err) {
    record("سلامة الملف (sha256 + فهرس pg_restore)", false, err instanceof Error ? err.message : String(err));
    return { success: false, steps, backupFile, scratchDatabase: "" };
  }

  const scratchDatabase = `satamoni_neo_restore_drill_${Date.now()}`;
  const admin = new Client({ connectionString: withDatabase(input.serverUrl, "postgres"), connectionTimeoutMillis: 10_000 });
  await admin.connect();
  let success = false;
  try {
    await admin.query(`CREATE DATABASE "${scratchDatabase}"`);
    record("إنشاء قاعدة مؤقتة نضيفة", true, scratchDatabase);
    const scratchUrl = withDatabase(input.serverUrl, scratchDatabase);

    try {
      await execFileAsync("pg_restore", ["--no-owner", "--no-privileges", "-d", scratchDatabase, backupFile], {
        env: pgEnvFromUrl(scratchUrl),
      });
      record("استرجاع النسخة (pg_restore)", true);
    } catch (err) {
      // pg_restore ممكن يرجّع exit code غير صفري بسبب تحذيرات (extensions/roles) والاسترجاع نفسه سليم -
      // الحكم الحقيقي في الفحوصات اللي بعده، مش الـexit code
      const message = err instanceof Error ? err.message.split("\n").slice(0, 3).join(" | ") : String(err);
      record("استرجاع النسخة (pg_restore)", true, `في تحذيرات - هيتأكد بالفحوصات: ${message}`);
    }

    const scratch = new Client({ connectionString: scratchUrl, connectionTimeoutMillis: 10_000 });
    await scratch.connect();
    let schemaOk = false;
    let dataOk = false;
    let accountingOk = false;
    try {
      const missing: string[] = [];
      for (const table of CORE_TABLES) {
        const res = await scratch.query("SELECT to_regclass($1) AS t", [`public.${table}`]);
        if (!res.rows[0].t) missing.push(table);
      }
      schemaOk = record(
        "الجداول الأساسية موجودة",
        missing.length === 0,
        missing.length === 0 ? `${CORE_TABLES.length} جدول` : `ناقص: ${missing.join(", ")}`
      );

      const counts: Record<string, number> = {};
      for (const table of DATA_SAMPLE_TABLES) {
        const exists = (await scratch.query("SELECT to_regclass($1) AS t", [`public.${table}`])).rows[0].t;
        counts[table] = exists ? Number((await scratch.query(`SELECT COUNT(*)::int AS c FROM "${table}"`)).rows[0].c) : 0;
      }
      // الـmigrations نفسها بتزرع مستخدم bootstrap واحد، فـ"أي جدول فيه صفوف" مش كفاية - أي تشغيل حقيقي
      // لازم يكون فيه فرع واحد على الأقل (مفيش migration بتزرع فروع)
      dataOk = record("في بيانات حقيقية (مش نسخة فاضية)", counts.branches > 0 && counts.users > 0, JSON.stringify(counts));

      const unbalanced = await scratch.query(`
        SELECT je.entry_number
        FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
        WHERE je.status IN ('POSTED', 'REVERSED')
        GROUP BY je.id, je.entry_number
        HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.000001`);
      accountingOk = record(
        "كل القيود المحاسبية المرحّلة متزنة",
        unbalanced.rows.length === 0,
        unbalanced.rows.length === 0 ? "متزنة" : `${unbalanced.rows.length} قيد غير متزن`
      );
    } finally {
      await scratch.end();
    }

    // BL-13: compare with the live/source database BEFORE migrating the restored copy (migrating changes it)
    let compareOk = true;
    if (input.compareSourceUrl) {
      const cmp = await compareDatabases(input.compareSourceUrl, scratchUrl, { tolerateSourceGrowth: input.tolerateSourceGrowth });
      compareOk = record(
        "مقارنة النسخة المسترجعة بالأصل (جداول، عدّادات، أرصدة، أدوار، migrations)",
        cmp.ok,
        cmp.ok ? `${cmp.rows.length} مقياس متطابق` : cmp.rows.filter((r) => !r.ok).map((r) => `${r.metric}: source=${r.source} restored=${r.restored}`).join(" | ")
      );
    }

    const migrationsOk = await migrateRestoredCopy(scratchUrl, record);
    success = schemaOk && dataOk && accountingOk && migrationsOk && compareOk;
  } finally {
    if (!input.keep) {
      await admin.query(`DROP DATABASE IF EXISTS "${scratchDatabase}" WITH (FORCE)`);
      record("تنظيف - مسح القاعدة المؤقتة", true, scratchDatabase);
    } else {
      record("القاعدة المؤقتة متسابة للفحص اليدوي (--keep)", true, scratchDatabase);
    }
    await admin.end();
  }

  return { success, steps, backupFile, scratchDatabase };
}

async function migrateRestoredCopy(scratchUrl: string, record: (step: string, ok: boolean, detail?: string) => boolean): Promise<boolean> {
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: scratchUrl, max: 1, connectionTimeoutMillis: 10_000 }) }),
  });
  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({ fs: fsp, path, migrationFolder: MIGRATIONS_DIR }),
    });
    const before = await migrator.getMigrations();
    const pending = before.filter((m) => !m.executedAt).length;
    const { error, results } = await migrator.migrateToLatest();
    if (error) {
      const failed = results?.find((r) => r.status === "Error")?.migrationName ?? "؟";
      return record("تحديث النسخة المسترجعة لآخر migration", false, `Failed at ${failed}: ${error instanceof Error ? error.message : error}`);
    }
    return record(
      "تحديث النسخة المسترجعة لآخر migration",
      true,
      pending === 0 ? `النسخة كانت محدّثة (${before.length} migration)` : `اتطبّق ${pending} migration ناقصين بنجاح`
    );
  } finally {
    await db.destroy();
  }
}

async function main() {
  const args = process.argv.slice(2);
  // مفيش رجوع لـDATABASE_URL ولا تحميل لـ.env: الوجهة لازم تتحدد صراحة في بيئة العملية وتكون سيرفر محلي (restore-target-guard.ts)
  const config = resolveRestoreDrillConfig(process.env);
  const serverUrl = config.targetUrl;
  const backupArg = args.find((a) => a.startsWith("--backup="));

  const report = await runRestoreDrill({
    serverUrl,
    backupFile: backupArg ? backupArg.slice("--backup=".length) : undefined,
    keep: args.includes("--keep"),
    compareSourceUrl: process.env.RESTORE_DRILL_COMPARE_SOURCE_URL || undefined,
    forbiddenServerUrls: config.sources.filter((s) => s.label !== "RESTORE_DRILL_COMPARE_SOURCE_URL"),
    tolerateSourceGrowth: process.env.RESTORE_DRILL_SOURCE_IS_LIVE === "true",
    log: (s) => console.log(`${s.ok ? "✓" : "✗"} ${s.step}${s.detail ? ` - ${s.detail}` : ""}`),
  });
  console.log(`\n=== النتيجة النهائية: ${report.success ? "نجاح ✓" : "فشل ✗"} ===`);
  process.exit(report.success ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Restore drill failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
