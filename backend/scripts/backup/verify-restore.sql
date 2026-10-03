-- verify-restore.sql - READ-ONLY integrity checks for a RESTORED COPY of the database.
--
-- Run it ONLY against a throw-away database that you restored a backup into (docs/BACKUP_AND_RECOVERY.md, section 6).
--   * the whole script runs inside BEGIN TRANSACTION READ ONLY ... ROLLBACK: any write attempt fails;
--   * it refuses to run unless the database name contains restore / scratch / drill / test, so pointing psql at the
--     application database by mistake stops at the first statement;
--   * it contains SELECT statements only (enforced by test/unit/scripts/verify-restore-sql.spec.ts).
-- Usage (psql meta-commands are used, so run it with psql, e.g. through `docker exec -i <container> psql ... < file`):
--   psql -U postgres -d satamoni_restore_check -f verify-restore.sql
-- Expected results are written next to each section. Anything else = do NOT trust this backup; investigate first.

\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

DO $guard$
BEGIN
  IF current_database() !~* '(restore|scratch|drill|test)' THEN
    RAISE EXCEPTION 'verify-restore.sql refuses to run on database "%": it is meant for a throw-away restored copy (name must contain restore, scratch, drill or test)', current_database();
  END IF;
END
$guard$;

\echo == 1 schema (expect: the same table / migration counts as production)
SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS migrations_applied, max(name) AS last_migration FROM kysely_migration;

\echo == 2 row counts (compare with production; the restored copy may only have FEWER rows if it is older)
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'branches', count(*) FROM branches
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'journal_entries', count(*) FROM journal_entries
UNION ALL SELECT 'journal_entry_lines', count(*) FROM journal_entry_lines
UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements
UNION ALL SELECT 'inventory_items', count(*) FROM inventory_items
UNION ALL SELECT 'employees', count(*) FROM employees
UNION ALL SELECT 'payroll_runs', count(*) FROM payroll_runs
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
ORDER BY 1;

\echo == 3 freshness (expect: dates close to the moment the backup was taken)
SELECT max(created_at) AS latest_order FROM orders;
SELECT max(created_at) AS latest_audit FROM audit_logs;

\echo == 4 accounting integrity (expect: 0 and t)
SELECT count(*) AS unbalanced_entries
FROM (
  SELECT je.id
  FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
  WHERE je.status IN ('POSTED', 'REVERSED')
  GROUP BY je.id
  HAVING abs(sum(l.debit) - sum(l.credit)) > 0.000001
) x;
SELECT (round(coalesce(sum(debit), 0)::numeric, 2) = round(coalesce(sum(credit), 0)::numeric, 2)) AS ledger_debit_equals_credit
FROM journal_entry_lines;

\echo == 5 inventory integrity (expect: t)
SELECT (round(coalesce((SELECT sum(quantity) FROM branch_stock_balances), 0)::numeric, 3)
      = round(coalesce((SELECT sum(quantity_delta) FROM stock_movements), 0)::numeric, 3)) AS stock_equals_movements;

\echo == 6 structural integrity (expect: no rows, except customers_loyalty_points_non_negative which migration 056 adds NOT VALID on purpose)
SELECT conrelid::regclass AS table_name, conname AS not_validated_constraint FROM pg_constraint WHERE NOT convalidated;
SELECT indexrelid::regclass AS invalid_index FROM pg_index WHERE NOT indisvalid;

\echo == 7 Phase 3.1 guards present (expect: both unique indexes and the two audit_logs triggers)
SELECT indexname FROM pg_indexes WHERE indexname IN ('uq_journal_entries_auto_source', 'uq_stock_movements_business_effect') ORDER BY 1;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal ORDER BY 1;

\echo == 8 roles present (expect: the same roles as production)
SELECT role, count(*) FROM users GROUP BY role ORDER BY role;

ROLLBACK;
