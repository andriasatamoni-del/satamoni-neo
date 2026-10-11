import { config as loadEnv } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool, type PoolClient } from "pg";
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

// Held for the whole run (adoption, order check, migrate): Render runs `migrate` on every instance start, and two
// overlapping starts must not apply the same pending migration twice. Drizzle's migrate() takes no lock of its own.
const MIGRATION_LOCK_KEY = "satamoni-neo:migrations";

// Returns true when it recorded the baseline as applied on a database the Kysely migrator had already built.
// The caller holds the migration lock.
async function adoptKyselyDatabase(client: PoolClient, migrationsFolder: string): Promise<boolean> {
  try {
    await client.query("BEGIN");
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
  }
}

// Drizzle applies a migration only when its timestamp is newer than the newest one already applied. A migration that
// lands out of order (two branches generated one each, the newer deployed first) would be skipped without an error,
// so refuse that instead: a journal whose timestamps do not increase, or a migration older than the newest applied one
// that was never applied.
async function assertMigrationOrder(client: PoolClient, migrationsFolder: string): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder });
  const tags = journalTags(migrationsFolder);
  for (let i = 1; i < files.length; i++) {
    if (files[i].folderMillis <= files[i - 1].folderMillis) {
      throw new Error(
        `Migration "${tags[i]}" is not newer than "${tags[i - 1]}" in drizzle/meta/_journal.json, so Drizzle would skip it. ` +
          `Regenerate it on top of the current migrations (pnpm db:generate).`
      );
    }
  }
  const { rows: journal } = await client.query<{ present: boolean }>(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present"
  );
  if (!journal[0].present) return;
  const { rows } = await client.query<{ created_at: string }>("SELECT created_at FROM drizzle.__drizzle_migrations");
  const applied = new Set(rows.map((r) => Number(r.created_at)));
  const newestApplied = Math.max(0, ...applied);
  files.forEach((file, i) => {
    if (file.folderMillis <= newestApplied && !applied.has(file.folderMillis)) {
      throw new Error(
        `Migration "${tags[i]}" was never applied but is older than the newest applied migration, so Drizzle would skip it. ` +
          `Regenerate it with a new timestamp on top of the current migrations.`
      );
    }
  });
}

function journalTags(migrationsFolder: string): string[] {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  return journal.entries.map((e) => e.tag);
}

// Adopts a Kysely-built database, checks the migration order and applies the pending migrations, all under one
// session-level advisory lock on a single connection. Returns whether the database was adopted.
export async function migrateDatabase(pool: Pool, migrationsFolder = MIGRATIONS_FOLDER): Promise<{ adopted: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [MIGRATION_LOCK_KEY]);
    try {
      const adopted = await adoptKyselyDatabase(client, migrationsFolder);
      await assertMigrationOrder(client, migrationsFolder);
      await migrate(drizzle(client), { migrationsFolder });
      return { adopted };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export async function runMigrations(connectionString: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const pool = new Pool({ connectionString, ssl: pgSslOption(), connectionTimeoutMillis: 10_000 });
  try {
    const { adopted } = await migrateDatabase(pool, migrationsFolder);
    if (adopted) {
      console.log(`✅ Existing Kysely database (at ${LAST_KYSELY_MIGRATION}) adopted: 0000_baseline recorded as applied`);
    }
  } finally {
    await pool.end();
  }
}

// backend/.env is loaded only when this file runs as the migration CLI. Importing it (the restore drill does) must not
// load .env: the drill takes its target from the real environment only (scripts/backup/restore-target-guard.ts).
async function main() {
  loadEnv();
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
