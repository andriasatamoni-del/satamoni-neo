import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit reads the Drizzle tables (src/shared/database/schema.ts re-exports every <ctx>.tables.ts) and writes
// SQL migrations to ./drizzle. Workflow: change a *.tables.ts file -> `pnpm db:generate` -> review the SQL -> commit.
// Triggers and functions are not modelled in TypeScript; add them with `pnpm db:generate --custom`.
// `pnpm migrate` (src/migrations/run-migrations.ts) applies the migrations; never run `drizzle-kit push` against a real database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
