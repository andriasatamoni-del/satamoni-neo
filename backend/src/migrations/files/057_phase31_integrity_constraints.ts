import { Kysely, sql } from "kysely";

// Phase 3.1 remediation (BL-01..BL-12 + audit integrity). Forward-only, additive, safe for existing data:
//
//  * DB-level de-duplication (defence in depth behind the transactional / row-locked commands):
//      - one journal entry per (auto source type, source id)           -> no duplicate sale / COGS / payroll / GRN / adjustment postings
//      - one reversal per original journal entry                        -> an entry can be reversed at most once
//      - one stock movement per (order|order_cancellation|conversion_order, reference, item, movement type)
//    These are PARTIAL unique indexes limited to rows created on/after the rollout cut-off, so historical rows that may already
//    contain duplicates (from the pre-fix concurrency bugs) never block the migration and are never rewritten; they are listed
//    by the journal-coverage / duplicate reports instead. Nothing is deleted or altered.
//  * payment_adjustment_requests: before-values recorded at approval time (full adjustment history, original evidence kept).
//  * payroll_adjustments.payroll_run_id: an adjustment is linked to at most one payroll run (never silently omitted or applied twice).
//  * audit_logs: outcome/http_status columns (SUCCESS / DENIED / FAILED) and an immutability trigger - UPDATE/DELETE of audit rows
//    is rejected for every role (the only tolerated UPDATE is the FK ON DELETE SET NULL cascade nulling actor/branch references).
//
// DDL is transactional in PostgreSQL and Kysely runs each migration in a transaction: a failure leaves no partial state.
const CUTOFF = "2026-10-02T00:00:00Z";

const AUTO_JOURNAL_SOURCES = [
  "order_sale",
  "order_cogs",
  "goods_receipt",
  "payroll_run",
  "payment_adjustment",
  "purchase",
  "cash_drawer_entry",
  "shift_variance",
  "driver_settlement",
  "driver_attendance_shift",
  "conversion_order",
  "stock_count",
  "supplier_invoice_variance",
];

export async function up(db: Kysely<unknown>): Promise<void> {
  const sources = AUTO_JOURNAL_SOURCES.map((s) => `'${s}'`).join(",");

  await sql.raw(`
    CREATE UNIQUE INDEX uq_journal_entries_auto_source
      ON journal_entries (source_type, source_id)
      WHERE source_id IS NOT NULL
        AND source_type IN (${sources})
        AND created_at >= '${CUTOFF}'::timestamptz
  `).execute(db);

  await sql.raw(`
    CREATE UNIQUE INDEX uq_journal_entries_single_reversal
      ON journal_entries (reversal_of_entry_id)
      WHERE reversal_of_entry_id IS NOT NULL
        AND created_at >= '${CUTOFF}'::timestamptz
  `).execute(db);

  await sql.raw(`
    CREATE UNIQUE INDEX uq_stock_movements_business_effect
      ON stock_movements (reference_type, reference_id, inventory_item_id, movement_type)
      WHERE reference_id IS NOT NULL
        AND reference_type IN ('order','order_cancellation','conversion_order')
        AND occurred_at >= '${CUTOFF}'::timestamptz
  `).execute(db);

  // supports the journal-coverage reconciliation queries
  await sql`CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries (source_type, source_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_type, reference_id)`.execute(db);

  // ---- payment adjustments: keep the before-values (original evidence is never overwritten) ----
  await sql`ALTER TABLE payment_adjustment_requests ADD COLUMN previous_payment_method_id uuid REFERENCES payment_methods(id)`.execute(db);
  await sql`ALTER TABLE payment_adjustment_requests ADD COLUMN previous_amount numeric`.execute(db);

  // ---- payroll adjustments <-> payroll runs ----
  await sql`ALTER TABLE payroll_adjustments ADD COLUMN payroll_run_id uuid REFERENCES payroll_runs(id)`.execute(db);
  await sql`CREATE INDEX idx_payroll_adjustments_run ON payroll_adjustments (payroll_run_id)`.execute(db);

  // ---- audit trail ----
  await sql`ALTER TABLE audit_logs ADD COLUMN outcome text NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS','DENIED','FAILED'))`.execute(db);
  await sql`ALTER TABLE audit_logs ADD COLUMN http_status integer`.execute(db);

  await sql`
    CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
         AND NEW.id = OLD.id AND NEW.action = OLD.action
         AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
         AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
         AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
         AND NEW.created_at = OLD.created_at
         AND NEW.outcome = OLD.outcome
         AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status
         AND (NEW.actor_user_id IS NULL OR NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)
         AND (NEW.branch_id IS NULL OR NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id)
      THEN
        RETURN NEW; -- ON DELETE SET NULL cascade of a deleted user/branch only
      END IF;
      RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END $$
  `.execute(db);
  await sql`CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable()`.execute(db);
  await sql`
    CREATE FUNCTION audit_logs_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit_logs is append-only (TRUNCATE rejected)' USING ERRCODE = 'insufficient_privilege'; END $$
  `.execute(db);
  await sql`CREATE TRIGGER trg_audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_no_truncate()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON audit_logs`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`.execute(db);
  await sql`DROP FUNCTION IF EXISTS audit_logs_no_truncate()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS audit_logs_immutable()`.execute(db);
  await sql`ALTER TABLE audit_logs DROP COLUMN IF EXISTS http_status`.execute(db);
  await sql`ALTER TABLE audit_logs DROP COLUMN IF EXISTS outcome`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_payroll_adjustments_run`.execute(db);
  await sql`ALTER TABLE payroll_adjustments DROP COLUMN IF EXISTS payroll_run_id`.execute(db);
  await sql`ALTER TABLE payment_adjustment_requests DROP COLUMN IF EXISTS previous_amount`.execute(db);
  await sql`ALTER TABLE payment_adjustment_requests DROP COLUMN IF EXISTS previous_payment_method_id`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_stock_movements_reference`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_journal_entries_source`.execute(db);
  await sql`DROP INDEX IF EXISTS uq_stock_movements_business_effect`.execute(db);
  await sql`DROP INDEX IF EXISTS uq_journal_entries_single_reversal`.execute(db);
  await sql`DROP INDEX IF EXISTS uq_journal_entries_auto_source`.execute(db);
}
