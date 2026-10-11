import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Database } from "./database.token";
import { pgSslOption } from "./pg-ssl";
import * as schema from "./schema";

// A database handle for command-line scripts (legacy imports, backups) and the tests that drive them: no Nest app and
// no ambient transaction, just a pool. Close it with closeScriptDb().
export function createScriptDb(connectionString: string): Database {
  return drizzle(new Pool({ connectionString, ssl: pgSslOption() }), { schema });
}

function poolOf(db: Database): Pool {
  return (db as unknown as { $client: Pool }).$client;
}

export async function closeScriptDb(db: Database): Promise<void> {
  await poolOf(db).end();
}

