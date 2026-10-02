import { planRetention } from "../../../scripts/backup/retention-plan";

// BL-13: the daily / monthly / yearly retention tiers must work "in practice" - simulated here over a 3-year timeline of
// daily backups, evaluated at several points in time, with both plain and encrypted (.gpg) names.
const name = (d: Date, suffix = "") =>
  `satamoni-neo-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-010700.dump${suffix}`;

function timeline(from: string, days: number, suffix = ""): string[] {
  const out: string[] = [];
  const start = new Date(from).getTime();
  for (let i = 0; i < days; i++) out.push(name(new Date(start + i * 86400000), suffix));
  return out;
}

describe("retention plan (daily 30d / monthly 12m / yearly forever)", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const names = timeline("2023-10-01T00:00:00Z", 1100); // up to 2026-10-04 -> includes "future" files, filtered below
  const history = names.filter((n) => n <= name(now));

  test("every backup of the last 30 days is kept", () => {
    const plan = planRetention(history, now);
    // cut-off = now - 30d = 2026-09-02T12:00Z; the backups run at 01:07, so 09-03 is the first fully inside the window
    const recent = history.filter((n) => n >= name(new Date("2026-09-03T00:00:00Z")));
    expect(recent.length).toBe(30);
    for (const n of recent) expect(plan.keep).toContain(n);
  });

  test("between 30 days and 12 months only the OLDEST backup of each month is kept", () => {
    const plan = planRetention(history, now);
    const monthly = plan.keep.filter((n) => n >= "satamoni-neo-20251002" && n < "satamoni-neo-20260903");
    expect(monthly).toHaveLength(12); // Oct-2025 .. Sep-2026, one per month
    expect(monthly.map((n) => n.slice(13, 19))).toEqual(["202510", "202511", "202512", "202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608", "202609"]);
    for (const n of monthly) expect(n).toMatch(/\d{6}(01|03)-010700/); // oldest in-window day of each month (Oct-2025 window starts on the 3rd)
    expect(plan.delete).toContain(name(new Date("2026-03-15T00:00:00Z")));
  });

  test("older than 12 months only the oldest backup of each year survives, forever", () => {
    const plan = planRetention(history, now);
    const yearly = plan.keep.filter((n) => n < "satamoni-neo-20251002");
    expect(yearly.sort()).toEqual([name(new Date("2023-10-01T00:00:00Z")), name(new Date("2024-01-01T00:00:00Z")), name(new Date("2025-01-01T00:00:00Z"))].sort());
  });

  test("never deletes the newest backup, and files that do not match the pattern are ignored (never deleted)", () => {
    const plan = planRetention([...history, "manual-copy.dump", "notes.txt"], now);
    expect(plan.keep).toContain(history[history.length - 1]);
    expect(plan.ignored.sort()).toEqual(["manual-copy.dump", "notes.txt"]);
    expect(plan.delete).not.toContain("manual-copy.dump");
  });

  test("encrypted (.gpg) names follow the identical policy", () => {
    const plain = planRetention(history, now);
    const enc = planRetention(history.map((n) => `${n}.gpg`), now, undefined, ".gpg");
    expect(enc.delete.map((n) => n.replace(/\.gpg$/, ""))).toEqual(plain.delete);
    expect(enc.keep.every((n) => n.endsWith(".gpg"))).toBe(true);
  });

  test("custom windows are honoured", () => {
    const plan = planRetention(history, now, { dailyDays: 7, monthlyMonths: 3 });
    expect(plan.keep.filter((n) => n >= "satamoni-neo-20260926").length).toBe(7);
    expect(plan.delete).toContain(name(new Date("2026-09-10T00:00:00Z")));
  });
});
