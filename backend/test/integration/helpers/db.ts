import { getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "../../../src/shared/database/database.token";

// Test-only: Drizzle has no TRUNCATE builder. The table names come from the schema objects, never from strings.
export async function truncate(db: Database, ...tables: PgTable[]): Promise<void> {
  await db.execute(sql`TRUNCATE ${sql.join(tables.map((t) => sql.identifier(getTableName(t))), sql`, `)} CASCADE`);
}
