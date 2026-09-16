import "dotenv/config";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { pgSslOption } from "../shared/database/pg-ssl";

async function main() {
  const direction = process.argv[2] === "down" ? "down" : "up";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("لازم تحدد DATABASE_URL");

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, ssl: pgSslOption() }) }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "files"),
    }),
  });

  const { error, results } = direction === "up" ? await migrator.migrateToLatest() : await migrator.migrateDown();

  results?.forEach((r) => {
    if (r.status === "Success") console.log(`✅ ${r.migrationName} (${r.direction})`);
    else if (r.status === "Error") console.error(`❌ ${r.migrationName} فشلت`);
  });

  if (error) {
    console.error("فشل تشغيل الـmigrations:", error);
    process.exit(1);
  }

  await db.destroy();
}

main();
