import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// Column types that keep the exact runtime values the app had under node-postgres' default parsers, so moving to
// Drizzle changes no API response.

// `date`: node-postgres turns 'YYYY-MM-DD' into local midnight. Drizzle's own date mode uses UTC midnight, which shifts
// the value by the process offset whenever TZ is not UTC (production pins UTC, a developer machine may not).
export const localDate = customType<{ data: Date; driverData: string }>({
  dataType: () => "date",
  fromDriver(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  },
  // node-postgres serialises a Date parameter itself, exactly as it did before.
  toDriver: (value) => value as unknown as string,
});

// `bigserial` ids (audit_logs, event_outbox): node-postgres returns int8 as a string; keep it a string so it stays
// JSON-serialisable and never loses precision. Inserts send SQL DEFAULT, so the sequence still assigns the id.
const bigserialAsString = customType<{ data: string; driverData: string }>({
  dataType: () => "bigserial",
});
export const bigintString = () => bigserialAsString().$defaultFn(() => sql`DEFAULT`);

// `bytea`: node-postgres returns a Buffer.
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
