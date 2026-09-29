// سياسة الاحتفاظ بالنسخ الاحتياطية - نفس سياسة db/backup.js في الريبو القديم بالظبط:
// كل نسخة في آخر dailyDays يوم بتتحفظ، بعد كده أقدم نسخة في كل شهر لحد monthlyMonths شهر، وبعد كده
// أقدم نسخة في كل سنة للأبد. التاريخ بيتقري من اسم الملف (مش وقت تعديله) عشان يفضل صحيح لو الملف اتنقل.

export const BACKUP_FILENAME_RE = /^satamoni-neo-(\d{4})(\d{2})(\d{2})-(\d{6})\.dump$/;

export interface BackupFile {
  name: string;
  date: Date;
  year: number;
  month: number;
}

export interface RetentionPolicy {
  dailyDays: number;
  monthlyMonths: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { dailyDays: 30, monthlyMonths: 12 };

export function backupFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `satamoni-neo-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}.dump`;
}

export function parseBackupFiles(names: string[]): BackupFile[] {
  const files: BackupFile[] = [];
  for (const name of names) {
    const m = BACKUP_FILENAME_RE.exec(name);
    if (!m) continue;
    files.push({
      name,
      date: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4].slice(0, 2)}:${m[4].slice(2, 4)}:${m[4].slice(4, 6)}Z`),
      year: Number(m[1]),
      month: Number(m[2]),
    });
  }
  return files.sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));
}

// بيرجّع أسماء الملفات اللي المفروض تتمسح - الباقي بيتحفظ. ملفات بأسماء مش مطابقة للنمط عمرها ما
// بتتلمس (ممكن تكون نسخ يدوية حد حطها في نفس المجلد)
export function filesToDelete(names: string[], now: Date, policy: RetentionPolicy = DEFAULT_RETENTION): string[] {
  const backups = parseBackupFiles(names);
  const dailyCutoff = new Date(now.getTime() - policy.dailyDays * 24 * 60 * 60 * 1000);
  const monthlyCutoff = new Date(now);
  monthlyCutoff.setUTCMonth(monthlyCutoff.getUTCMonth() - policy.monthlyMonths);

  const keep = new Set<string>();
  const keptMonths = new Set<string>();
  const keptYears = new Set<number>();
  for (const b of backups) {
    if (b.date >= dailyCutoff) {
      keep.add(b.name);
    } else if (b.date >= monthlyCutoff) {
      const key = `${b.year}-${b.month}`;
      if (!keptMonths.has(key)) {
        keptMonths.add(key);
        keep.add(b.name);
      }
    } else if (!keptYears.has(b.year)) {
      keptYears.add(b.year);
      keep.add(b.name);
    }
  }
  return backups.filter((b) => !keep.has(b.name)).map((b) => b.name);
}
