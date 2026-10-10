import "dotenv/config";
import * as path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { pgSslOption } from "../shared/database/pg-ssl";

// قاعدة بيانات Render (خصوصًا Free plan) ممكن تاخد شوية وقت لسه بتتجهز أول ما الـblueprint يتعمل
// (أول deploy) أو لسه صاحية من sleep - من غير timeout واضح على الـPool، محاولة الاتصال كانت بتعلّق
// من غير أي رسالة خطأ لحد ما Render نفسه بيقفل الـdeploy كله بعد دقايق طويلة (port scan timeout) -
// ده اللي حصل فعليًا وسبب فشل deploy. الحل: timeout قصير لكل محاولة اتصال + إعادة محاولة محدودة مع
// تأخير، عشان لو قاعدة البيانات لسه بتتجهز نستنى شوية بدل ما نفشل فورًا أو نعلّق للأبد
const CONNECT_RETRY_ATTEMPTS = 10;
const CONNECT_RETRY_DELAY_MS = 5000;

// Migrations are Drizzle SQL files in backend/drizzle (forward-only; there is no "down").
export const MIGRATIONS_FOLDER = path.join(__dirname, "../../drizzle");

// The schema used to be migrated by Kysely (src/migrations/files, 001..058). The first Drizzle migration
// (0000_baseline) is exactly that schema, so a database the Kysely migrator brought to 058 adopts the baseline as
// already applied instead of running it.
export const LAST_KYSELY_MIGRATION = "058_menu_category_archive_and_layout";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabase(connectionString: string): Promise<void> {
  for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt++) {
    const probe = new Pool({ connectionString, ssl: pgSslOption(), connectionTimeoutMillis: 5000, max: 1 });
    try {
      await probe.query("SELECT 1");
      await probe.end();
      console.log(`✅ Connected to the database (attempt ${attempt}/${CONNECT_RETRY_ATTEMPTS})`);
      return;
    } catch (err) {
      await probe.end().catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`⏳ Database connection attempt ${attempt}/${CONNECT_RETRY_ATTEMPTS} failed: ${message}`);
      if (attempt === CONNECT_RETRY_ATTEMPTS) {
        throw new Error(`Could not connect to the database after ${CONNECT_RETRY_ATTEMPTS} attempts: ${message}`);
      }
      await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }
}

// Returns true when it recorded the baseline as applied on a database the Kysely migrator had already built.
export async function adoptKyselyDatabase(pool: Pool, migrationsFolder = MIGRATIONS_FOLDER): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Two deploys starting at once must not both adopt.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('satamoni-neo:migrations', 0))");
    const { rows: kysely } = await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.kysely_migration') IS NOT NULL AS present"
    );
    if (!kysely[0].present) {
      await client.query("COMMIT");
      return false;
    }
    const { rows: last } = await client.query<{ name: string | null }>("SELECT max(name) AS name FROM public.kysely_migration");
    if (last[0].name !== LAST_KYSELY_MIGRATION) {
      throw new Error(
        `This database was migrated by Kysely only up to "${last[0].name ?? "nothing"}". ` +
          `Bring it to ${LAST_KYSELY_MIGRATION} with the last Kysely release before switching to the Drizzle migrations.`
      );
    }
    // Same bookkeeping table Drizzle's migrator creates.
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)"
    );
    const { rows: applied } = await client.query<{ n: string }>("SELECT count(*) AS n FROM drizzle.__drizzle_migrations");
    if (Number(applied[0].n) > 0) {
      await client.query("COMMIT");
      return false;
    }
    const [baseline] = readMigrationFiles({ migrationsFolder });
    await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [
      baseline.hash,
      baseline.folderMillis,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(connectionString: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const pool = new Pool({ connectionString, ssl: pgSslOption(), connectionTimeoutMillis: 10_000 });
  try {
    if (await adoptKyselyDatabase(pool, migrationsFolder)) {
      console.log(`✅ Existing Kysely database (at ${LAST_KYSELY_MIGRATION}) adopted: 0000_baseline recorded as applied`);
    }
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main() {
  if (process.argv[2] === "down") {
    throw new Error("Migrations are forward-only; there is no down migration. Write a new migration that reverses the change.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  console.log("Connecting to the database...");
  await waitForDatabase(connectionString);

  console.log("Running migrations...");
  await runMigrations(connectionString);
  console.log("✅ Migrations are up to date");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Migration script failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
