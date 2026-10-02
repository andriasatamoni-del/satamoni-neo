// Operational retention tool (BL-13). Applies the documented daily/monthly/yearly policy to a LIST of backup
// names (from a directory, a file, or an S3 listing) and prints what would be kept / deleted. It never touches
// storage itself, so the exact same logic is testable offline and reusable for local dirs and remote buckets.
//
//   npx ts-node scripts/backup/retention-plan.ts --dir ./backups [--now 2026-10-02T00:00:00Z]
//   npx ts-node scripts/backup/retention-plan.ts --names-file names.txt --suffix .gpg --print-delete
//
// Policy (see docs/BACKUP_AND_RECOVERY.md): every backup younger than BACKUP_DAILY_RETENTION_DAYS (30) is kept;
// older ones keep only the OLDEST backup of each calendar month up to BACKUP_MONTHLY_RETENTION_MONTHS (12);
// older still keep only the oldest backup of each year, forever.
import * as fs from "node:fs";
import { DEFAULT_RETENTION, filesToDelete, parseBackupFiles, type RetentionPolicy } from "./retention";

export interface RetentionPlan {
  keep: string[];
  delete: string[];
  ignored: string[];
}

// names may carry an extra suffix (e.g. ".gpg" for encrypted copies): it is stripped for policy purposes
export function planRetention(names: string[], now: Date, policy: RetentionPolicy = DEFAULT_RETENTION, suffix = ""): RetentionPlan {
  const base = new Map<string, string>(); // plain-name -> original name
  for (const n of names) base.set(suffix && n.endsWith(suffix) ? n.slice(0, -suffix.length) : n, n);
  const plain = [...base.keys()];
  const parsed = new Set(parseBackupFiles(plain).map((f) => f.name));
  const del = new Set(filesToDelete(plain, now, policy));
  return {
    keep: plain.filter((n) => parsed.has(n) && !del.has(n)).map((n) => base.get(n)!),
    delete: plain.filter((n) => del.has(n)).map((n) => base.get(n)!),
    ignored: plain.filter((n) => !parsed.has(n)).map((n) => base.get(n)!),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const now = arg("--now") ? new Date(arg("--now")!) : new Date();
  const suffix = arg("--suffix") ?? "";
  const policy: RetentionPolicy = {
    dailyDays: Number(process.env.BACKUP_DAILY_RETENTION_DAYS) || DEFAULT_RETENTION.dailyDays,
    monthlyMonths: Number(process.env.BACKUP_MONTHLY_RETENTION_MONTHS) || DEFAULT_RETENTION.monthlyMonths,
  };
  let names: string[];
  if (arg("--dir")) names = fs.readdirSync(arg("--dir")!);
  else if (arg("--names-file")) names = fs.readFileSync(arg("--names-file")!, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  else throw new Error("usage: --dir <dir> | --names-file <file> [--suffix .gpg] [--now ISO] [--print-delete]");

  const plan = planRetention(names, now, policy, suffix);
  if (process.argv.includes("--print-delete")) {
    for (const n of plan.delete) console.log(n);
    return;
  }
  for (const n of plan.keep) console.log(`KEEP    ${n}`);
  for (const n of plan.delete) console.log(`DELETE  ${n}`);
  for (const n of plan.ignored) console.log(`IGNORE  ${n} (name does not match the backup pattern; never touched)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
