import { backupFilename, filesToDelete, parseBackupFiles } from "../../../scripts/backup/retention";

const name = (iso: string) => backupFilename(new Date(iso));

describe("backup retention policy", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("اسم الملف بيتقري تاني لنفس التاريخ", () => {
    const n = name("2026-09-29T03:04:05Z");
    expect(n).toBe("satamoni-neo-20260929-030405.dump");
    expect(parseBackupFiles([n])[0].date.toISOString()).toBe("2026-09-29T03:04:05.000Z");
  });

  it("كل النسخ في آخر 30 يوم بتتحفظ", () => {
    const files = ["2026-09-28T03:00:00Z", "2026-09-15T03:00:00Z", "2026-09-01T03:00:00Z"].map(name);
    expect(filesToDelete(files, now)).toEqual([]);
  });

  it("بعد 30 يوم: أقدم نسخة في كل شهر بس", () => {
    const keepJuly = name("2026-07-02T03:00:00Z");
    const dropJuly = name("2026-07-20T03:00:00Z");
    const keepAug = name("2026-08-01T03:00:00Z");
    const dropAug = name("2026-08-15T03:00:00Z");
    expect(filesToDelete([dropJuly, keepJuly, dropAug, keepAug], now).sort()).toEqual([dropAug, dropJuly].sort());
  });

  it("أقدم من سنة: نسخة واحدة في السنة وبتفضل للأبد", () => {
    const keep2024 = name("2024-02-01T03:00:00Z");
    const drop2024 = name("2024-11-01T03:00:00Z");
    const keep2023 = name("2023-05-01T03:00:00Z");
    expect(filesToDelete([keep2024, drop2024, keep2023], now)).toEqual([drop2024]);
  });

  it("ملفات بأسماء مش مطابقة للنمط عمرها ما بتتمسح", () => {
    expect(filesToDelete(["manual-before-migration.dump", "notes.txt", "satamoni-20200101-000000.dump"], now)).toEqual([]);
  });

  it("السياسة قابلة للتعديل", () => {
    const old = name("2026-09-20T03:00:00Z");
    const older = name("2026-09-19T03:00:00Z");
    expect(filesToDelete([old, older], now, { dailyDays: 3, monthlyMonths: 12 })).toEqual([old]);
  });
});
