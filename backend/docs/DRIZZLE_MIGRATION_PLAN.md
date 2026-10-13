# Plan: replace Kysely with Drizzle ORM (satamoni-neo backend)

> Based on **`main` @ `67c0aed`** (Merge PR #16: pnpm workspace + `pnpm dev` with Docker Postgres). File counts were measured on `ae221fb`; PR #16 only touched tooling, docs and error-message wording, not the Kysely footprint.
> Commands below use pnpm (`pnpm --filter satamoni-neo-backend …` or from inside `backend/`). Local Postgres 17 comes from `docker-compose.yml` (`pnpm db:up`).

## Context

The backend talks to Postgres through **Kysely**, a typed query builder. Table types are written by hand (`*.schema.ts` + `database.types.ts`), and migrations are hand-written Kysely files (58 of them). The goal is to switch to **Drizzle ORM**:

- **One source of truth for the schema:** the Drizzle table definitions *are* the TS types. Nothing is synced by hand any more.
- **Generated, reviewable migrations** via `drizzle-kit generate`, instead of hand-writing every one.
- **Safe-by-default queries:** values are always parameterized, and Drizzle's `sql` template is safe.
- **Kysely removed completely** from code, scripts, tests, `package.json` and docs.

These stay exactly as they are: the Postgres constraints and triggers (append-only `audit_logs`, the partial unique indexes from 057, period locks), the **one-command = one-transaction** model, savepoints, `FOR UPDATE` and advisory locks, and every API response shape.

## Scope (measured on `origin/main`)

| Area | Files | Notes |
|---|---|---|
| Repositories / readers / stores (`kysely-*.ts`) | 87 | 367 `selectFrom`, 101 `insertInto`, 75 `onConflict`, 69 `db.fn`, 48 expression-builder uses |
| Table type files (`*.schema.ts`) + `database.types.ts` | 37 | replaced by Drizzle `pgTable` definitions |
| Context modules (`*.module.ts`) | 29 | import / class-name updates only |
| Other `src` files | 15 | transaction layer, event bus, audit, branch scope, business-date, … |
| Migrations | 58 + runner | folded into one baseline SQL |
| Legacy import + backup scripts | 15 | |
| Integration tests + helpers | 101 | 873 raw `sql\`` uses; `app.get(KYSELY)` ×147 |
| Docs / config | 4 | `CLAUDE.md`, `DEPLOYMENT.md`, `PHASE31_REMEDIATION.md`, `backend/package.json` |
| Frontend | 0 | not affected |

## Key design decisions

### 1. Transaction layer: same semantics, now on Drizzle
`backend/src/shared/database/transaction-context.ts` keeps its API (`TransactionService.run / isolated / lockRow / advisoryLock`, `afterCommit`, `isInTransaction`, the deadlock/serialization retry), so **no command handler changes**.
- **Drizzle runs the transactions.** `run()` calls `db.transaction(async (tx) => …)` (Drizzle issues BEGIN/COMMIT/ROLLBACK) and stores `tx` in `AsyncLocalStorage`. `isolated()` uses `tx.transaction(...)` (a Drizzle savepoint), and `lockRow()` uses the builder's `.for("update")`.
- **Our wrapper only adds what Drizzle lacks:** the ambient transaction (the Proxy below, so `tx` isn't passed through every call), the retry on `40P01`/`40001`, `afterCommit()` hooks, and `advisoryLock()` (a `pg_advisory_xact_lock` fragment, since there's no builder method).
- The injected `DATABASE` stays a **Proxy**: inside a command it routes to the transaction's Drizzle instance, otherwise to the pool. A nested `db.transaction(fn)` just runs `fn(currentTx)`, which is the same behavior as today.
- **While contexts are being ported only:** `run()` borrows one connection from the pool, creates Drizzle on it and calls Drizzle's `transaction()` (Drizzle still issues BEGIN/COMMIT). A temporary Kysely instance on the same connection lets ported and unported code share **one** transaction, so every commit stays green. Once Kysely is removed, `run()` simplifies to `this.db.transaction(...)` on the pool.

### 2. Schema: generated from the real database, split per context
- Migrate a scratch DB to 058, run `drizzle-kit pull`, then split the output into one file per context: `contexts/<ctx>/infrastructure/persistence/<ctx>.tables.ts`.
- `shared/database/schema.ts` re-exports them all. It replaces `database.types.ts`.
- Column modes are chosen so runtime values stay identical to today: `numeric` → string, `timestamptz` → `Date`, `jsonb().$type<T>()`. `date` and `bigint` copy whatever TS type the current `*.schema.ts` declares for that column.
- Partial unique indexes and checks are declared in the schema (`uniqueIndex().on(...).where(sql…)`, `check()`). Triggers and functions stay in SQL migrations, because Drizzle doesn't model them.

### 3. Migrations: one baseline, then Drizzle Kit
- `backend/drizzle/0000_baseline.sql` = `pg_dump --schema-only --no-owner` of a DB migrated to 058 (Kysely bookkeeping tables excluded), plus the seed rows from **044** (Talabat system user) and **045** (home tiles). The baseline `meta/0000_snapshot.json` comes from `drizzle-kit pull`.
- From then on: change the schema in TS → `drizzle-kit generate` → review the SQL → commit. Trigger and function changes use `drizzle-kit generate --custom`.
- **Existing databases (production, the user's dev DB):** the new `run-migrations.ts` handles them:
  - If `kysely_migration` exists with `058` applied and Drizzle's journal is empty, it records the baseline as applied, so the baseline is never re-run against live data.
  - If `kysely_migration` exists but stops before 058, it **fails loudly**.
  - Then it runs `migrate()`.
  - The old `kysely_migration` table is kept as history and never dropped.
- Forward-only: `migrate:down` is removed. Drizzle has no down migrations, which matches the existing policy.

### 4. No raw SQL statements: everything uses the Drizzle query builder
All 929 raw `` sql`…`.execute(db) `` statements (56 in `src`, 873 in tests) are rewritten with the query builder (`select / insert / update / delete`, joins, `$with` for CTEs, `count / sum / …`). That way every query is type-checked against the schema, and results map through the schema's column modes, so date and numeric types stay consistent.
- `sql\`…\`` survives only as a **fragment inside a builder query**, for what the builder has no method for: Postgres functions (`coalesce`, `pg_advisory_xact_lock`), the Cairo business-date expression (`businessDateSql()`) and window functions in reports. Values in fragments are still parameterized.
- Transaction internals have no raw statements: `isolated()` uses Drizzle's native nested `tx.transaction()` (a SAVEPOINT), and `lockRow()` uses `.select({ id }).from(table).where(eq(table.id, id)).for("update")`, with the table looked up from the schema by name (an unknown name throws).
- No `executeRaw` helper. The only plain SQL left is in the `.sql` migration files.
- **Test-only exceptions** (things the query builder cannot express; never in `src` or `scripts`): a `truncate(db, ...tables)` helper in `test/integration/helpers/db.ts`, `SET LOCAL session_replication_role` in the specs that bypass triggers on purpose, the failure-injection DDL in the phase31 specs, and the phase31 harness's generic FK cleanup. Each one is a single `db.execute(sql…)` call.

### 5. Naming: business names, not ORM names
The ORM is an infrastructure detail. Class, file and token names describe the business role, so swapping the ORM again would not rename anything.
- Implementations take the plain business name. Ports already end in `Port`, so nothing clashes (checked: none of the 88 plain names is taken):
  - `kysely-branch.repository.ts` → `branch.repository.ts`, and `KyselyBranchRepository` → `BranchRepository`, implementing `BranchRepositoryPort`.
  - `KyselyAccountingReportsReader` → `AccountingReportsReader`; `KyselyImageStore` → `ImageStore`.
  - The `infrastructure/persistence/` folder already says these are the database implementations.
- The DI token `KYSELY` → `DATABASE` (`database.token.ts`), and the type `Kysely<Database>` → `Database`. A token is still needed because NestJS can only inject classes automatically, and the database handle is a plain object (the transaction Proxy over Drizzle), not a class: `constructor(@Inject(DATABASE) private readonly db: Database)`.
- Renames use `git mv`, so file history is kept.

## Kysely → Drizzle translation cheat-sheet (used for every file)

| Kysely | Drizzle |
|---|---|
| `db.selectFrom("t").selectAll().where("id","=",x).executeTakeFirst()` | `(await db.select().from(t).where(eq(t.id,x)).limit(1))[0]` |
| `.where((eb) => eb.or([...]))` | `.where(or(...))` with `eq/and/or/inArray/isNull/gte/…` |
| `.insertInto("t").values(r).onConflict(oc => oc.column("id").doUpdateSet(s))` | `.insert(t).values(r).onConflictDoUpdate({ target: t.id, set: s })` |
| `.onConflict(oc => oc.doNothing())` | `.onConflictDoNothing()` |
| `.updateTable("t").set(s).where(...)` / `.deleteFrom("t")` | `.update(t).set(s).where(...)` / `.delete(t).where(...)` |
| `.returning([...])` | `.returning({...})` |
| `db.fn.count / sum / coalesce` | `count()`, `sum()`, `` sql`coalesce(...)` `` |
| `.forUpdate()` | `.for("update")` |
| `` sql`SELECT … FROM t WHERE …`.execute(db) `` | rewritten as a builder query: `db.select({...}).from(t).innerJoin(...).where(...)` |
| `` sql`INSERT INTO t …`.execute(db) `` (tests) | `db.insert(t).values({...})` |
| CTE / `WITH …` | `db.$with("name").as(...)` + `db.with(name).select()…` |
| window function / `AT TIME ZONE` / Postgres function | `` sql<T>`…` `` fragment inside `.select({...})` or `.where(...)` |
| `Kysely<Database>` / `@Inject(KYSELY)` | `Database` / `@Inject(DATABASE)` |
| `Selectable<XTable>` / `Insertable<XTable>` | `typeof x.$inferSelect` / `typeof x.$inferInsert` |

---

## Execution phases (one branch `refactor/drizzle-orm` from `origin/main`, one PR, ordered commits; the full suite stays green after each commit)

### Phase 0: Spike (no merge-worthy code until it passes)
1. Add `drizzle-orm` + `drizzle-kit`. Migrate a scratch DB to 058, then `drizzle-kit pull`.
2. Build the baseline SQL, apply it to an empty DB, and **diff `pg_dump --schema-only` of both DBs → must be identical.**
3. `drizzle-kit generate` against the pulled schema → must report *no changes*.
4. Prove that builder queries return the same JS values as Kysely does today for timestamptz / date / numeric / bigint / jsonb columns, so API responses don't change.

### Phase 1: Foundation
- Drizzle tables per context + `schema.ts`.
- New `database.module.ts` / `database.token.ts` / `transaction-context.ts` (with the temporary Kysely bridge).
- Baseline migration + new `run-migrations.ts` (`global-setup.js` already runs it unchanged).
- The backup scripts move to Phase 3: they keep working until the old migration files are deleted in Phase 4.
- The `package.json` script changes (`db:generate`, `db:check`, dropping `migrate:down`) land in Phase 4.

### Phase 2: Port contexts (one commit per context, tests in the same commit)
Order, from least to most risky:
1. branches, settings, home-tiles, media, notifications, printing, expenses, crm, customers, loyalty
2. identity-access, branch-day, shifts, treasury, delivery, talabat, whatsapp, storefront
3. inventory, production, catalog, purchases, procurement
4. hr-payroll, payment-control, reporting
5. orders
6. accounting (last)

### Phase 3: Scripts
The 12 legacy imports + the backup scripts use a shared `createScriptDb(url)` helper.

### Phase 4: Remove Kysely
- Delete the bridge, `kysely` from `package.json` and the old migrations.
- `grep -ri kysely backend/` must return nothing except the adoption check for the `kysely_migration` table name.
- Update the docs.

---

## Files REMOVED (deleted, not renamed)

| File(s) | Why |
|---|---|
| `backend/src/migrations/files/001…058_*.ts` (58 files, listed below) | folded into `backend/drizzle/0000_baseline.sql` (still in git history) |
| `backend/src/shared/database/database.types.ts` | replaced by `shared/database/schema.ts` |
| `backend/src/shared/database/kysely.token.ts` | replaced by `database.token.ts` |
| 34 context `*.schema.ts` files (listed below) | replaced by `<ctx>.tables.ts` Drizzle definitions |
| `backend/src/shared/audit/audit-log.schema.ts`, `backend/src/shared/events/event-outbox.schema.ts` | → `shared/database/shared.tables.ts` |
| `backend/test/integration/scripts/migration-057-upgrade.spec.ts` | tests an upgrade path that can no longer run (pre-057 Kysely migrations are gone). Replaced by `baseline-adoption.spec.ts` |

<details><summary>The 58 migration files</summary>

001_create_identity_access_tables · 002_create_crm_tables · 003_create_branches_table · 004_create_inventory_tables · 005_create_catalog_tables · 006_create_procurement_tables · 007_create_orders_tables · 008_create_delivery_tables · 009_create_accounting_tables · 010_create_payment_control_tables · 011_add_payment_method_to_orders · 012_create_hr_payroll_tables · 013_create_cashier_shifts_table · 014_add_kitchen_timestamps_to_orders · 015_create_treasuries_and_banks_tables · 016_create_supplier_invoices_and_payments_tables · 017_create_purchase_requests_and_returns_tables · 018_create_driver_settlements_and_shifts_tables · 019_create_stocktakes_tables · 020_create_leave_requests_and_attendance_shifts_tables · 021_create_audit_logs_table · 022_create_conversion_orders_tables · 023_create_whatsapp_intake_tables · 024_create_order_ratings_table · 025_create_printing_tables · 026_create_cash_drawer_entries_table · 027_create_pos_settings_table · 028_create_branch_days_table · 029_create_branch_stock_thresholds_table · 030_add_order_id_to_customer_followups · 031_create_menu_item_modifiers_tables · 032_create_order_item_modifiers_table · 033_add_client_request_id_to_orders · 034_add_import_batch_id_to_reconciliation_records · 035_create_accounting_periods_and_fiscal_year_closings · 036_create_payroll_adjustments_table · 037_create_transfer_requests_tables · 038_add_posted_by_to_journal_entries · 039_create_expenses_tables · 040_create_purchases_tables · 041_create_combos_tables · 042_create_departments_and_positions_tables · 043_create_customers_tables · 044_create_talabat_integration_tables · 045_create_home_tiles_table · 046_add_cost_to_stock_movements · 047_create_employee_history_table · 048_create_menu_price_history_table · 049_add_supplier_document_number_to_goods_receipts · 050_create_inventory_batches_table · 051_add_batch_fields_to_goods_receipt_items · 052_add_partially_received_purchase_order_status · 053_whatsapp_ai_bot · 054_create_order_notifications · 055_online_storefront · 056_customer_accounts_loyalty_media · 057_phase31_integrity_constraints · 058_menu_category_archive_and_layout
</details>

<details><summary>The 34 context <code>*.schema.ts</code> files</summary>

accounting.schema · branch-day.schema · branch.schema · catalog.schema · complaint.schema · customer-followup.schema · customer.schema · delivery.schema · expense-category.schema · expense.schema · home-tile.schema · hr-payroll.schema · user.schema · branch-stock-threshold.schema · inventory-batch.schema · inventory-item.schema · stock-movement.schema · stocktake.schema · transfer-request.schema · loyalty.schema · media.schema · order-notification.schema · order.schema · payment-control.schema · printing.schema · procurement.schema · conversion-order.schema · purchase.schema · pos-settings.schema · cash-drawer-entry.schema · cashier-shift.schema · talabat.schema · treasury.schema · whatsapp.schema
(all under `backend/src/contexts/<ctx>/infrastructure/persistence/`)
</details>

## Files ADDED

| File | Purpose |
|---|---|
| `backend/drizzle.config.ts` | Drizzle Kit config (schema path, `out: ./drizzle`, dialect postgresql) |
| `backend/drizzle/0000_baseline.sql`, `backend/drizzle/meta/_journal.json`, `meta/0000_snapshot.json` | baseline migration |
| `backend/src/shared/database/schema.ts` | re-exports every table (replaces `database.types.ts`) |
| `backend/src/shared/database/shared.tables.ts` | `audit_logs`, `event_outbox` |
| `backend/src/shared/database/database.token.ts` | `DATABASE` token + `Database` type |
| `backend/src/shared/database/script-db.ts` | `createScriptDb(url)` for the import and backup scripts |
| `backend/src/contexts/<ctx>/infrastructure/persistence/<ctx>.tables.ts` | Drizzle tables per context (~28 files) |
| `backend/test/integration/scripts/baseline-adoption.spec.ts` | proves an existing (Kysely-058) DB is adopted without re-running the baseline, and a pre-058 DB is refused |

## Files CHANGED

### Core (`backend/src/shared`, `backend/src/migrations`)
- `shared/database/database.module.ts`: builds the Drizzle pool + Proxy and provides `DATABASE` + `TransactionService`.
- `shared/database/transaction-context.ts`: rewritten as described in decision 1 (same public API).
- `shared/database/pg-ssl.ts`: unchanged (reused).
- `migrations/run-migrations.ts`: keeps `waitForDatabase` retry; adds baseline adoption + Drizzle `migrate()`; drops `down`.
- `shared/events/event-bus.service.ts`, `shared/audit/audit-log.service.ts`, `shared/authorization/branch-scope.ts`, `shared/procurement/purchase-duplicate-check.service.ts`, `shared/time/business-date.ts` (`businessDateSql()` returns a Drizzle `sql` fragment).

### Contexts: `kysely-` prefix dropped (e.g. `kysely-branch.repository.ts` → `branch.repository.ts`, class `BranchRepository`), queries rewritten; modules updated
| Context | Files |
|---|---|
| accounting | accounting.module · post-order-cancellation-journal-entry.handler · accounting-repair.service · journal-coverage · kysely-account.repository · kysely-accounting-period.repository · kysely-accounting-reports-reader · kysely-fiscal-year-closing.repository · kysely-journal-entry.repository |
| branch-day | branch-day.module · kysely-branch-day-checklist-reader · kysely-branch-day.repository |
| branches | branches.module · kysely-branch.repository |
| catalog | catalog.module · menu-price-history.service · kysely-combo.repository · kysely-menu-category.repository · kysely-menu-item.repository · kysely-recipe.repository |
| crm | crm.module · kysely-complaint.repository · kysely-customer-followup.repository · kysely-followup-queue-reader |
| customers | customers.module · kysely-customer.repository |
| delivery | delivery.module · kysely-delivery-assignment.repository · kysely-driver-attendance-shift.repository · kysely-driver-settlement-reader · kysely-driver-settlement.repository · kysely-driver.repository |
| expenses | expenses.module · kysely-expense-category.repository · kysely-expense.repository |
| home-tiles | home-tiles.module · kysely-home-tile.repository |
| hr-payroll | hr-payroll.module · employee-history.service · termination-blockers.service · kysely-department / employee-attendance-shift / employee / leave-request / payroll-adjustment / payroll-run / position .repository |
| identity-access | identity-access.module · kysely-user.repository |
| inventory | inventory.module · kysely-branch-stock-threshold / inventory-batch / inventory-item / stock-movement / stocktake / transfer-request .repository · kysely-requisition-suggestion.reader |
| loyalty | loyalty.module · kysely-loyalty-ledger · kysely-loyalty-reward.repository |
| media | media.module · kysely-image.store |
| notifications | notifications.module · kysely-order-notification.store |
| orders | orders.module · order-rating.aggregate (type import only) · kysely-order-rating.repository · kysely-order.repository |
| payment-control | payment-control.module · kysely-payment-adjustment-request / payment-method / payment / reconciliation-record .repository |
| printing | printing.module · kysely-kitchen-station / print-job / printer .repository |
| procurement | procurement.module · kysely-goods-receipt / purchase-order / purchase-request / purchase-return / supplier-invoice / supplier-payment / supplier .repository · kysely-supplier-balance-reader |
| production | production.module · kysely-conversion-order.repository |
| purchases | purchases.module · kysely-purchase.repository |
| reporting | reporting.module · kysely-action-center / branch-health / dashboard-summary / delivery-customer-reports / food-cost / inventory-reports / procurement-reports / sales-ops -reader |
| settings | settings.module · kysely-pos-settings.repository |
| shifts | shifts.module · kysely-cash-drawer-entry.repository · kysely-cashier-shift.repository · kysely-shift-financials-reader |
| storefront | storefront.module · kysely-storefront.reader |
| talabat | talabat.module · kysely-talabat-integration-error / talabat-order / talabat-product-mapping / talabat-webhook-event .repository |
| treasury | treasury.module · kysely-bank-account / bank / treasury .repository · kysely-treasury-balance-reader |
| whatsapp | whatsapp.module · kysely-bot-knowledge.reader · kysely-whatsapp-conversation / whatsapp-message / whatsapp-pending-order .repository |

### Scripts (`backend/scripts/`)
- `import-{branches,users,crm,customers,inventory,catalog,procurement,orders,drivers,accounting,payment-control,hr-payroll}-from-legacy.ts` (12): `new Kysely(...)` → `createScriptDb()`, Drizzle repositories. The legacy side stays raw `pg`.
- `backup/restore-drill.ts`: uses the new migration runner instead of Kysely's `Migrator`.
- `backup/compare-databases.ts`, `backup/verify-restore.sql`: read `drizzle.__drizzle_migrations` (fall back to `kysely_migration` for old backups).

### Tests (`backend/test/integration/`)
- `global-setup.js`: unchanged DROP SCHEMA + disposable-DB guard; runs the new migration runner.
- `setup.ts`, `helpers/audit.ts`, `helpers/second-user.ts`, `phase31/harness.ts`.
- **All 95 spec files that touch Kysely:** `app.get(KYSELY)` → `app.get(DATABASE)`; the 873 raw `` sql`…`.execute(db) `` setup and check statements are rewritten as builder queries (`db.insert(t).values(...)`, `db.select().from(t).where(...)`); `new KyselyXRepository` → `new XRepository`.
- The 17 `kysely-*.repository.spec.ts` files drop the prefix, e.g. `kysely-branch.repository.spec.ts` → `branch.repository.spec.ts` (accounting ×2, branches, catalog ×2, crm ×2, hr-payroll ×2, identity-access, inventory ×2, payment-control ×4, procurement).
- **Assertions are not changed.** The suite must pass with the same expectations; that is the proof that behavior didn't change.

### Config & docs
- `backend/package.json`: − `kysely`; + `drizzle-orm`, `drizzle-kit` (dev); scripts `migrate` (runner), + `db:generate` (`drizzle-kit generate`), + `db:check` (`drizzle-kit check`); − `migrate:down`.
- `.github/workflows/ci.yml`: add a `drizzle-kit check` + "generate produces no diff" gate (schema drift detection).
- `CLAUDE.md`, `DEPLOYMENT.md`, `backend/docs/PHASE31_REMEDIATION.md`: Kysely → Drizzle; new migration workflow; baseline-adoption note.
- `render.yaml`: unchanged (`pnpm run migrate && pnpm run start` keeps working).

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Baseline differs from the real 058 schema | Phase 0 gate: `pg_dump --schema-only` diff must be empty |
| Production re-runs the baseline | Adoption logic + `baseline-adoption.spec.ts`; pre-058 DBs are refused |
| Row type drift (dates, numerics, bigint) changes API responses | Column modes mirror the current types; Phase 0 check 4; assertions in the integration suite are unchanged |
| Rewriting raw report SQL as builder queries changes results | Reporting and accounting are ported late; report specs assert exact figures and must pass unchanged |
| Transaction semantics change | `transaction-context.ts` keeps its API; the phase31 concurrency + failure-injection specs must pass untouched |
| Huge diff to review | One commit per context + `git mv` for renames |

## Verification (per commit and at the end)
1. `cd backend && pnpm install && pnpm exec tsc --noEmit -p tsconfig.json`
2. `pnpm test:unit`
3. `pnpm test:integration` (local `satamoni_neo_test` + `satamoni_legacy_fixture_test`; `pg_dump` 17 on PATH for the backup drill). **All suites pass, including `phase31/*`.**
4. `pnpm exec drizzle-kit generate` → "No schema changes"; `pnpm exec drizzle-kit check` clean.
5. Adoption dry-run: restore a copy of a Kysely-058 DB (dev DB or the backup drill), run `pnpm migrate`, and confirm the baseline is marked applied, nothing is re-run, and the app boots.
6. Final: `grep -rni kysely backend/src backend/scripts backend/test backend/package.json` → only the `kysely_migration` adoption check remains, and `grep -rn "db.execute(" backend/src backend/scripts` → nothing (no standalone raw statements); in `backend/test` only the listed test-only exceptions.
7. `pnpm start:dev` + `cd frontend && pnpm dev`, then smoke-test: login, create a POS order, pay, check the journal coverage report.
