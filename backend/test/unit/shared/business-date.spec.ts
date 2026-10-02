import {
  businessDate,
  businessDateString,
  businessDayStartUtc,
  businessRangeUtc,
  businessYearMonth,
  cairoUtcOffsetMinutes,
} from "../../../src/shared/time/business-date";

// BL-12: Cairo business date helper - midnight, month-end and both UTC offsets (summer UTC+3 / winter UTC+2) and the DST transitions.
describe("business date (Africa/Cairo)", () => {
  test("summer (UTC+3): 23:59 and 00:00 Cairo fall on different business dates; both are the same UTC day", () => {
    const beforeMidnight = new Date("2026-09-15T20:59:59Z"); // 23:59:59 Cairo on the 15th
    const afterMidnight = new Date("2026-09-15T21:00:00Z"); //  00:00:00 Cairo on the 16th
    expect(beforeMidnight.toISOString().slice(0, 10)).toBe("2026-09-15"); // UTC date = the bug
    expect(afterMidnight.toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(businessDateString(beforeMidnight)).toBe("2026-09-15");
    expect(businessDateString(afterMidnight)).toBe("2026-09-16");
    expect(cairoUtcOffsetMinutes(afterMidnight)).toBe(180);
  });

  test("winter (UTC+2): boundary is 22:00 UTC", () => {
    expect(businessDateString(new Date("2026-01-15T21:59:59Z"))).toBe("2026-01-15");
    expect(businessDateString(new Date("2026-01-15T22:00:00Z"))).toBe("2026-01-16");
    expect(cairoUtcOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(120);
  });

  test("00:01 Cairo is the next business date in both seasons", () => {
    expect(businessDateString(new Date("2026-07-09T21:01:00Z"))).toBe("2026-07-10");
    expect(businessDateString(new Date("2026-12-09T22:01:00Z"))).toBe("2026-12-10");
  });

  test("month boundary: a sale at 00:30 on the 1st (Cairo) belongs to the NEW month although UTC says the previous month", () => {
    const instant = new Date("2026-09-30T21:30:00Z"); // 00:30 Cairo, 1 October
    expect(instant.toISOString().slice(0, 7)).toBe("2026-09");
    expect(businessYearMonth(instant)).toEqual({ year: 2026, month: 10 });
    const lastSecond = new Date("2026-09-30T20:59:59Z"); // 23:59:59 Cairo, 30 September
    expect(businessYearMonth(lastSecond)).toEqual({ year: 2026, month: 9 });
  });

  test("year boundary (winter)", () => {
    expect(businessYearMonth(new Date("2025-12-31T22:00:00Z"))).toEqual({ year: 2026, month: 1 });
    expect(businessYearMonth(new Date("2025-12-31T21:59:59Z"))).toEqual({ year: 2025, month: 12 });
  });

  test("businessDate() returns the Cairo date at 00:00 UTC (round-trips through a Postgres date column)", () => {
    expect(businessDate(new Date("2026-09-15T21:30:00Z")).toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  test("day start instants are DST-correct, including the transition days", () => {
    expect(businessDayStartUtc("2026-09-16").toISOString()).toBe("2026-09-15T21:00:00.000Z"); // +3
    expect(businessDayStartUtc("2026-01-16").toISOString()).toBe("2026-01-15T22:00:00.000Z"); // +2
    // Egypt DST: starts Friday 2026-04-24 at 00:00 (-> 01:00), ends Thursday 2026-10-29 at 24:00 (-> 23:00)
    expect(businessDayStartUtc("2026-04-24").toISOString()).toBe("2026-04-23T22:00:00.000Z");
    expect(businessDayStartUtc("2026-04-25").toISOString()).toBe("2026-04-24T21:00:00.000Z");
    expect(businessDayStartUtc("2026-10-29").toISOString()).toBe("2026-10-28T21:00:00.000Z");
    expect(businessDayStartUtc("2026-10-30").toISOString()).toBe("2026-10-29T22:00:00.000Z");
  });

  test("businessRangeUtc covers whole Cairo days", () => {
    const r = businessRangeUtc("2026-09-16", "2026-09-16");
    expect(r.from.toISOString()).toBe("2026-09-15T21:00:00.000Z");
    expect(r.toExclusive.toISOString()).toBe("2026-09-16T21:00:00.000Z");
  });
});
