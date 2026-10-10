import * as path from "node:path";
import { promises as fsp } from "node:fs";
import { Client, Pool } from "pg";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from "kysely";
import { withDatabase } from "../../../scripts/backup/pg-env";

// Phase 3.1 migration 057 on a DISPOSABLE database (created and dropped by this test - never the application/production database):
//   * upgrades a populated 056 database without touching or failing on historical rows (duplicates from the pre-fix era are KEPT),
//   * enforces the new uniqueness/immutability rules for rows created after the cut-off,
//   * is atomic (a failing step leaves no partial schema) and reversible (down() restores the 056 shape, data intact).
const MIGRATION_057 = "057_phase31_integrity_constraints"; // the spec is about 057 itself: newer migrations must not change what it applies / reverts
describe("migration 057 (Phase 3.1) - forward-only safe upgrade", () => {
  const serverUrl = process.env.DATABASE_URL as string;
  const dbName = `satamoni_neo_mig057_test_${Date.now()}`;
  const url = withDatabase(serverUrl, dbName);
  const provider = new FileMigrationProvider({ fs: fsp, path, migrationFolder: path.join(__dirname, "../../../src/migrations/files") });
  let admin: Client;
  let pool: Pool;
  let kysely: Kysely<unknown>;
  let migrator: Migrator;

  const q = (text: string, params: unknown[] = []) => pool.query(text, params);
  const scalar = async (text: string, params: unknown[] = []) => (await q(text, params)).rows[0]?.v;
  const columnExists = async (table: string, column: string) =>
    Number(await scalar(`SELECT count(*)::int AS v FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, column])) === 1;
  const indexExists = async (name: string) => Number(await scalar(`SELECT count(*)::int AS v FROM pg_indexes WHERE indexname = $1`, [name])) === 1;

  beforeAll(async () => {
    admin = new Client({ connectionString: withDatabase(serverUrl, "postgres") });
    admin.on("error", () => undefined);
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    // DROP DATABASE ... WITH (FORCE) in afterAll terminates any connection still open; an idle pooled client then emits
    // "terminating connection due to administrator command" (57P01) as an UNHANDLED error and fails the whole suite
    // (seen on CI). Every pool therefore gets an error handler: the termination is expected there.
    pool = new Pool({ connectionString: url, max: 2 });
    pool.on("error", () => undefined);
    const migratorPool = new Pool({ connectionString: url, max: 1 });
    migratorPool.on("error", () => undefined);
    kysely = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: migratorPool }) });
    migrator = new Migrator({ db: kysely, provider });
    const { error } = await migrator.migrateTo("056_customer_accounts_loyalty_media");
    if (error) throw error;
  });

  afterAll(async () => {
    await kysely.destroy();
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  test("056 baseline: none of the Phase 3.1 objects exist yet", async () => {
    expect(await columnExists("audit_logs", "outcome")).toBe(false);
    expect(await columnExists("payroll_adjustments", "payroll_run_id")).toBe(false);
    expect(await columnExists("payment_adjustment_requests", "previous_amount")).toBe(false);
    expect(await indexExists("uq_journal_entries_auto_source")).toBe(false);
  });

  test("seed a populated 056 database, including historical duplicates created by the pre-fix concurrency bugs", async () => {
    await q(`INSERT INTO accounts (id, code, name, account_type, is_system_account) VALUES (gen_random_uuid(), '1100', 'cash', 'ASSET', true)`);
    // historical duplicate sale journals for the same order (created before the cut-off) + an audit row + a payroll adjustment
    for (let i = 0; i < 2; i++) {
      await q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status, created_at) VALUES ('2026-01-05', 'legacy dup', 'order_sale', 'order-legacy-1', 'DRAFT', '2026-01-05T10:00:00Z')`);
    }
    await q(`INSERT INTO audit_logs (action) VALUES ('LEGACY ACTION')`);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM journal_entries WHERE source_id = 'order-legacy-1'`))).toBe(2);
  });

  test("a FAILING 057 leaves NO partial schema (atomic), and the data is untouched", async () => {
    // make a late step of the migration fail: its index name already exists
    await q(`CREATE TABLE sabotage_marker (id int)`);
    await q(`CREATE INDEX idx_payroll_adjustments_run ON sabotage_marker (id)`);
    const { error } = await migrator.migrateTo(MIGRATION_057);
    expect(error).toBeTruthy();
    expect(await indexExists("uq_journal_entries_auto_source")).toBe(false); // created EARLIER in the same migration - rolled back
    expect(await indexExists("uq_stock_movements_business_effect")).toBe(false);
    expect(await columnExists("audit_logs", "outcome")).toBe(false);
    expect(await columnExists("payroll_adjustments", "payroll_run_id")).toBe(false);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM journal_entries WHERE source_id = 'order-legacy-1'`))).toBe(2);
    await q(`DROP INDEX idx_payroll_adjustments_run`);
    await q(`DROP TABLE sabotage_marker`);
  });

  test("057 applies cleanly over historical duplicates (they are reported by the coverage report, never deleted or rewritten)", async () => {
    const { error, results } = await migrator.migrateTo(MIGRATION_057);
    expect(error).toBeUndefined();
    expect(results?.some((r) => r.migrationName.startsWith("057_") && r.status === "Success")).toBe(true);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM journal_entries WHERE source_id = 'order-legacy-1'`))).toBe(2);
    expect(await scalar(`SELECT outcome AS v FROM audit_logs WHERE action = 'LEGACY ACTION'`)).toBe("SUCCESS"); // existing rows get the default
    expect(await columnExists("payroll_adjustments", "payroll_run_id")).toBe(true);
    expect(await columnExists("payment_adjustment_requests", "previous_payment_method_id")).toBe(true);
    expect(await columnExists("payment_adjustment_requests", "previous_amount")).toBe(true);
  });

  test("after the cut-off a second automatic journal for the same business transaction is rejected by the database", async () => {
    await q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status) VALUES (CURRENT_DATE, 'sale', 'order_sale', 'order-new-1', 'DRAFT')`);
    await expect(
      q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status) VALUES (CURRENT_DATE, 'sale again', 'order_sale', 'order-new-1', 'DRAFT')`)
    ).rejects.toMatchObject({ code: "23505" });
    // manual entries (no auto source type) are never constrained
    await q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status) VALUES (CURRENT_DATE, 'm1', 'manual', 'x', 'DRAFT')`);
    await q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status) VALUES (CURRENT_DATE, 'm2', 'manual', 'x', 'DRAFT')`);
  });

  test("an entry can be reversed at most once (unique reversal)", async () => {
    const original = await scalar(`SELECT id AS v FROM journal_entries WHERE source_id = 'order-new-1'`);
    await q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status, reversal_of_entry_id) VALUES (CURRENT_DATE, 'rev', 'reversal', $1::text, 'DRAFT', $1::uuid)`, [original]);
    await expect(
      q(`INSERT INTO journal_entries (entry_date, description, source_type, source_id, status, reversal_of_entry_id) VALUES (CURRENT_DATE, 'rev2', 'reversal', $1::text, 'DRAFT', $1::uuid)`, [original])
    ).rejects.toMatchObject({ code: "23505" });
  });

  test("audit_logs became append-only: UPDATE / DELETE / TRUNCATE are rejected", async () => {
    await expect(q(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(q(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
    await expect(q(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM audit_logs`))).toBe(1);
  });

  test("down() restores the 056 shape and keeps the data (reversible)", async () => {
    const { error, results } = await migrator.migrateDown();
    expect(error).toBeUndefined();
    expect(results?.[0].migrationName.startsWith("057_")).toBe(true);
    expect(await columnExists("audit_logs", "outcome")).toBe(false);
    expect(await columnExists("payroll_adjustments", "payroll_run_id")).toBe(false);
    expect(await indexExists("uq_journal_entries_auto_source")).toBe(false);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM audit_logs WHERE action = 'LEGACY ACTION'`))).toBe(1);
    expect(Number(await scalar(`SELECT count(*)::int AS v FROM journal_entries WHERE source_id = 'order-legacy-1'`))).toBe(2);
    // and it can be re-applied
    const again = await migrator.migrateTo(MIGRATION_057);
    expect(again.error).toBeUndefined();
  });
});
