import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./database.token";
import type { Database as KyselyDatabase } from "./database.types";
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

// TEMPORARY (Kysely -> Drizzle migration): a Kysely instance on the same pool, for the repositories that are not ported
// yet. Never destroy it (that would end the shared pool); closeScriptDb() closes both. Deleted with the last Kysely
// repository.
const kyselyByDb = new WeakMap<object, Kysely<KyselyDatabase>>();
export function kyselyOn(db: Database): Kysely<KyselyDatabase> {
  let kysely = kyselyByDb.get(db);
  if (!kysely) {
    kysely = new Kysely<KyselyDatabase>({ dialect: new PostgresDialect({ pool: poolOf(db) }) });
    kyselyByDb.set(db, kysely);
  }
  return kysely;
}
