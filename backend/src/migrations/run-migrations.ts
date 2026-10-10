import "dotenv/config";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { pgSslOption } from "../shared/database/pg-ssl";

// قاعدة بيانات Render (خصوصًا Free plan) ممكن تاخد شوية وقت لسه بتتجهز أول ما الـblueprint يتعمل
// (أول deploy) أو لسه صاحية من sleep - من غير timeout واضح على الـPool، محاولة الاتصال كانت بتعلّق
// من غير أي رسالة خطأ لحد ما Render نفسه بيقفل الـdeploy كله بعد دقايق طويلة (port scan timeout) -
// ده اللي حصل فعليًا وسبب فشل deploy. الحل: timeout قصير لكل محاولة اتصال + إعادة محاولة محدودة مع
// تأخير، عشان لو قاعدة البيانات لسه بتتجهز نستنى شوية بدل ما نفشل فورًا أو نعلّق للأبد
const CONNECT_RETRY_ATTEMPTS = 10;
const CONNECT_RETRY_DELAY_MS = 5000;

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

async function main() {
  const direction = process.argv[2] === "down" ? "down" : "up";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  console.log("Connecting to the database...");
  await waitForDatabase(connectionString);

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, ssl: pgSslOption(), connectionTimeoutMillis: 10_000 }),
    }),
  });

  console.log("Running migrations...");
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
    else if (r.status === "Error") console.error(`❌ ${r.migrationName} failed`);
  });

  if (error) {
    console.error("Migrations failed:", error);
    process.exit(1);
  }

  await db.destroy();
}

main().catch((err) => {
  console.error("Migration script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
