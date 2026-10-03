import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

// أدوات التحقق من ملفات النسخ الاحتياطي (بصمة + فهرس pg_restore). **مفيش dotenv هنا عمدًا**: restore-drill.ts بيستورد
// من الملف ده بدل backup.ts عشان `backend/.env` ميتحمّلش وميقدرش يغيّر وجهة الاسترجاع (راجع restore-target-guard.ts).
const execFileAsync = promisify(execFile);

export function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// pg_restore --list reads the whole TOC; a dump that is truncated or not custom-format makes it exit non-zero.
export async function verifyDumpReadable(file: string): Promise<{ entries: number }> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("pg_restore", ["--list", file], { maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    throw new Error(`النسخة مش قابلة للقراءة بـpg_restore --list: ${err instanceof Error ? err.message : err}`);
  }
  const entries = stdout.split("\n").filter((l) => l && !l.startsWith(";")).length;
  if (entries < 10) throw new Error(`النسخة فاضية تقريبًا (${entries} عنصر في الفهرس)`);
  return { entries };
}

// Verifies a backup file against its sha256 sidecar (detects bit-rot / tampering after the backup was made)
export async function verifyBackupFile(file: string): Promise<{ sha256: string; entries: number }> {
  const sidecar = `${file}.sha256`;
  const actual = sha256File(file);
  if (fs.existsSync(sidecar)) {
    const expected = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    if (expected !== actual) throw new Error(`sha256 مش مطابق للنسخة ${path.basename(file)} - النسخة اتغيّرت/اتلفت`);
  }
  const { entries } = await verifyDumpReadable(file);
  return { sha256: actual, entries };
}


export function backupDirFromEnv(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}
