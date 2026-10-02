import { sql, type RawBuilder } from "kysely";

// Phase 3.1 (BL-12): ONE definition of "business date" for the whole system = the calendar date in Africa/Cairo.
//
// Instants (created_at, occurred_at, ...) stay timestamptz in UTC - stored semantics do not change. Whenever the system needs
// to know "which business day / month does this transaction belong to" it must use these helpers (TypeScript) or
// `businessDateSql()` (SQL) - NEVER `toISOString().slice(0, 10)` / `::date` on a UTC timestamp, which puts a sale made at
// 00:30 Cairo time (21:30 UTC, summer) on the previous day (and, at month end, in the previous month / accounting period).
//
// Egypt observes DST (UTC+3 summer, UTC+2 winter); the Intl/Postgres tz databases supply the rules, so both offsets and the
// transition days are handled without hardcoding.
export const BUSINESS_TIME_ZONE = "Africa/Cairo";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// 'YYYY-MM-DD' of the Cairo calendar day containing the instant
export function businessDateString(instant: Date = new Date()): string {
  return dateFormatter.format(instant);
}

// A Date at 00:00:00 UTC of the Cairo calendar day (what a Postgres `date` column round-trips as in this codebase)
export function businessDate(instant: Date = new Date()): Date {
  return new Date(`${businessDateString(instant)}T00:00:00.000Z`);
}

export function businessYearMonth(instant: Date = new Date()): { year: number; month: number } {
  const [y, m] = businessDateString(instant).split("-");
  return { year: Number(y), month: Number(m) };
}

// Offset (minutes east of UTC) that Cairo has at the given instant: 120 in winter, 180 in summer
export function cairoUtcOffsetMinutes(instant: Date): number {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value])) as Record<string, string>;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

// The UTC instant at which the given Cairo calendar day starts (00:00 Cairo). DST-safe: tries both candidate offsets.
export function businessDayStartUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  for (const offset of [180, 120]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offset * 60000);
    if (businessDateString(candidate) === dateStr && businessDateString(new Date(candidate.getTime() - 1000)) !== dateStr) return candidate;
  }
  // fall back to the offset in force at noon (only reachable for exotic transitions at exactly midnight)
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - cairoUtcOffsetMinutes(noon) * 60000);
}

// The last millisecond (inclusive upper bound) of the Cairo calendar day
export function businessDayEndUtc(dateStr: string): Date {
  const next = new Date(`${dateStr}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(businessDayStartUtc(next.toISOString().slice(0, 10)).getTime() - 1);
}

// Inclusive [fromTs, toTs] instants for optional Cairo date strings, defaulting to the last `defaultDays` business days ending today
export function businessRangeTs(from: string | undefined, to: string | undefined, defaultDays: number): { fromTs: Date; toTs: Date } {
  const toStr = to ?? businessDateString();
  let fromStr = from;
  if (!fromStr) {
    const d = new Date(`${toStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (defaultDays - 1));
    fromStr = d.toISOString().slice(0, 10);
  }
  return { fromTs: businessDayStartUtc(fromStr), toTs: businessDayEndUtc(toStr) };
}

// [from, toExclusive) UTC instants covering the Cairo calendar days fromDate..toDate inclusive
export function businessRangeUtc(fromDate: string, toDate: string): { from: Date; toExclusive: Date } {
  const next = new Date(`${toDate}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { from: businessDayStartUtc(fromDate), toExclusive: businessDayStartUtc(next.toISOString().slice(0, 10)) };
}

// SQL expression: the Cairo business date of a timestamptz column/expression, e.g.
//   .select(businessDateSql(sql.ref("orders.created_at")).as("d"))   or   sql`${businessDateSql(sql.ref("created_at"))} = ${d}`
export function businessDateSql(column: RawBuilder<unknown>): RawBuilder<string> {
  return sql<string>`((${column} AT TIME ZONE 'Africa/Cairo')::date)`;
}

// Same, for raw SQL strings (existing readers build text fragments)
export function businessDateSqlText(columnSql: string): string {
  return `((${columnSql} AT TIME ZONE 'Africa/Cairo')::date)`;
}
