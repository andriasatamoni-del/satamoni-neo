import type { ColumnType, Generated, JSONColumnType } from "kysely";

export interface EventOutboxTable {
  id: Generated<string>;
  event_name: string;
  payload: JSONColumnType<Record<string, unknown>>;
  occurred_at: ColumnType<Date, string | Date, never>;
  recorded_at: Generated<ColumnType<Date, string | Date | undefined, never>>;
}
