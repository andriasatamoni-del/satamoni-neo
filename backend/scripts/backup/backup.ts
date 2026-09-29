import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { backupFilename, filesToDelete, type RetentionPolicy } from "./retention";
import { pgEnvFromUrl } from "./pg-env";

const execFileAsync = promisify(execFile);
const MIN_VALID_BACKUP_BYTES = 1024;

// OPS-1: نسخة احتياطية واحدة بـpg_dump -Fc (custom format - بيدعم pg_restore الانتقائي وأصغر من SQL
// نصي) + تطبيق سياسة الاحتفاظ. السكريبت نفسه مش بيعمل جدولة - بيتشغّل من cron خارجي (راجع
// docs/BACKUP_AND_RECOVERY.md). نفس فكرة db/backup.js في الريبو القديم.
export async function createBackup(databaseUrl: string, dir: string, now = new Date()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, backupFilename(now));
  await execFileAsync("pg_dump", ["-Fc", "--no-owner", "--no-privileges", "-f", fullPath], { env: pgEnvFromUrl(databaseUrl) });

  const size = fs.statSync(fullPath).size;
  if (size < MIN_VALID_BACKUP_BYTES) {
    // ملف أصغر من 1KB غالبًا معناه pg_dump فشل بصمت - مانسيبش نسخة فاشلة شكلها ناجح
    fs.unlinkSync(fullPath);
    throw new Error(`ملف النسخة صغير جدًا (${size} بايت) - على الأرجح النسخ فشل`);
  }
  return fullPath;
}

export function applyRetention(dir: string, now = new Date(), policy?: RetentionPolicy): string[] {
  if (!fs.existsSync(dir)) return [];
  const deleted = filesToDelete(fs.readdirSync(dir), now, policy);
  for (const name of deleted) fs.unlinkSync(path.join(dir, name));
  return deleted;
}

export function backupDirFromEnv(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

export function retentionFromEnv(): RetentionPolicy {
  return {
    dailyDays: Number(process.env.BACKUP_DAILY_RETENTION_DAYS) || 30,
    monthlyMonths: Number(process.env.BACKUP_MONTHLY_RETENTION_MONTHS) || 12,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("لازم تحدد DATABASE_URL");
  const dir = backupDirFromEnv();

  console.log(`جاري النسخ الاحتياطي في ${dir} ...`);
  const file = await createBackup(databaseUrl, dir);
  console.log(`✅ تم: ${path.basename(file)} (${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} ميجابايت)`);

  const deleted = applyRetention(dir, new Date(), retentionFromEnv());
  for (const name of deleted) console.log(`اتمسحت (خارج سياسة الاحتفاظ): ${name}`);
  console.log(`سياسة الاحتفاظ: ${deleted.length} نسخة اتمسحت`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل النسخ الاحتياطي:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
