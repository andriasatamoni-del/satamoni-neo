# Phase 3.1 — Complete Remediation (operator & developer guide)

Source of truth: `PHASE3_VALIDATION_REPORT.md` (BL-01 … BL-14 and the must-fix list). This document describes **what the system now
guarantees, how to operate it, and which decisions were taken where the approved requirements were silent.** Migration:
`057_phase31_integrity_constraints` (forward-only, additive, transactional, with a tested `down()`).

## 1. Transaction & idempotency foundation (BL-01, 02, 03, 04, 09)

* Every protected business command is **one PostgreSQL transaction** (`TransactionService.run`). The `KYSELY` provider is a thin proxy
  that routes every repository query of the current request to that transaction, so existing repositories/ports are unchanged.
* Concurrency control: `SELECT … FOR UPDATE` on the aggregate row first (`lockRow`), state validation second; ingredient rows are locked in
  sorted order; client idempotency keys are serialised with `pg_advisory_xact_lock`. Deadlocks/serialization failures are retried (max 3).
* Event bus: **critical** subscribers (accounting postings, payment lock, order payment-method sync) run *inside* the publisher's
  transaction — a failure rolls the whole command back. **Non-critical** subscribers (printing, notifications, loyalty, treasury) run after commit.
* Defence in depth in the database (partial unique indexes, effective for rows created on/after `2026-10-02`): one automatic journal per
  `(source_type, source_id)`, one reversal per journal entry, one business-effect stock movement per `(reference, item, type)`.
  Historical duplicates are **never** deleted/rewritten; they are reported by the coverage report.
* Error mapping: state conflicts (already confirmed / cancelled / decided / not in progress / over-receipt …) are **409**; PG `23505`,
  `40P01`, `40001`, `P0001` → 409; malformed UUID/number/date → 400; missing chart of accounts → 503. Real infrastructure failures stay 500.

## 2. Reliable accounting posting (BL-08)

* `ACCOUNTING_ENFORCEMENT=strict` (**default, required in production**): posting needs the full chart of accounts; a missing account aborts the
  business transaction with **503** and writes nothing. `deferred` exists only for migration/legacy windows: the business transaction commits and the
  missing journal is recorded as a *gap* (never silently skipped).
* `GET /accounting/readiness` — chart-of-accounts completeness + active mode. `GET /accounting/reports/journal-coverage` — every sale, COGS,
  GRN payable, payroll, payment adjustment, and unreversed cancellation without its journal. `GET /accounting/reports/business-date-drift`.
* `POST /accounting/repair/journals` (permission `accounting.repair`, company-wide only, audited per item, idempotent, savepoint per item,
  original Cairo business date). Action Center alerts: `ACCOUNTING_NOT_CONFIGURED`, `MISSING_JOURNALS`.
* Reports count `POSTED` **and** `REVERSED` entries (a reversed original stays in the ledger and its mirror cancels it). Before this fix a
  cancelled order showed as `-revenue` in the trial balance / income statement.
* Required accounts: 1100 cash, 1400 inventory, 2100 suppliers, 2400 accrued payroll, 4100 sales, 5100 COGS, 6100 payroll expense, 6950 cash variance.

## 3. COGS (BL-07)

Separate journal `order_cogs` (Dr 5100 / Cr 1400) from the **actual consumption movements** (qty × item unit cost at consumption,
existing last-purchase-cost method preserved). No recipe → no consumption → no COGS (no invented cost). Cancellation restores stock from the
*original* movements (original quantity and cost) and reverses the sale, COGS and payment-adjustment journals.

## 4. Payment adjustments (BL-06) — accountant to confirm

Sale facts are never edited. Each approval posts the **amount delta** as a cash-variance correction (decrease: Dr 6950 / Cr 1100; increase:
Dr 1100 / Cr 6950), source `payment_adjustment` = request id. A method-only change has no GL effect (all methods settle through the cash
account in the approved chart) but syncs `orders.payment_method_id`; real payment-method metadata is preserved. Before-values
(`previous_amount`, `previous_payment_method_id`) are stored. Repeated / conflicting decisions → 409.

## 5. Segregation of duties (BL-05)

No admin bypass (no emergency-administration policy exists in the approved requirements): the user who **registered** a payroll run /
**requested** a payment adjustment / **registered** a supplier invoice can never approve it (`403`, audited `DENIED`). Pilot staffing therefore needs
**at least two privileged users** (e.g. admin + accountant).

## 6. Payroll (BL-04, BL-10)

Approval is locked + idempotent; cancelling an APPROVED run reverses its journal once and frees the month. Payroll adjustments
(advance/penalty/bonus) of the month are applied to the run lines and **linked** (`payroll_adjustments.payroll_run_id`): omitted line values
default to the adjustments; typed values that contradict registered adjustments need `acknowledgeAdjustmentMismatch` (audited); a linked
adjustment cannot be cancelled; deleting/cancelling the run unlinks them; approval is refused while eligible adjustments of the month were never applied.
The deferred attendance→payroll automation was **not** added (accepted decision).

## 7. Procurement (BL-09 + must-fix)

Over-receipt is rejected at registration and (under the PO row lock) at confirmation; a PO-linked GRN inherits the PO supplier (mismatch,
foreign branch or foreign item rejected); AP is recognised once at GRN confirmation; invoices match receipts (variance only); invoice approval has SoD.
Historical receipts without a supplier are not back-filled (it would change posted GL expectations) — they are listed by the coverage report.

## 8. Branch isolation (BL-11)

Scope is derived **only** from the authenticated identity (role + `users.branch_id`), never from a client value or a permission:
`admin`, `accountant` company-wide; `callcenter` company-wide only without a branch; everyone else bound to their branch (no branch ⇒ no access).
Foreign `branchId` (query/path/body) ⇒ **403 + DENIED audit**; a foreign resource by id ⇒ **404**; collections filtered; HR lists show own-branch staff
**without salary data**; payroll, adjustments, supplier balances, GL, drift/repair, Talabat integration errors are **company-wide only**; transfers are
visible to both branches, approved/dispatched by the sender, received by the receiver. Custom permission grants cannot widen scope
(tested). Enforced by `BranchScopeGuard` + decorators (`@BranchScoped`, `@BranchResource`, `@BranchResources`, `@BranchFilteredList`, `@CompanyWideOnly`).
Not branch-scoped on purpose (company master data / public): catalog, suppliers master, payment methods, POS settings, loyalty rewards, home tiles,
media, storefront/customer portal, WhatsApp conversations, order ratings.
*Note:* the treasuries list keeps its older rule that also pins the accountant to a branch.

## 9. Cairo business date (BL-12)

All stored timestamps are `timestamptz`. DB sessions stay UTC; the Cairo business day is always explicit — `shared/time/business-date.ts`
(`businessDateString`, `businessDayStartUtc/EndUtc`, `businessRangeTs`) in TypeScript and `AT TIME ZONE 'Africa/Cairo'` in SQL. 23:59 / 00:00 / 00:01,
summer (+3) / winter (+2) and month boundaries are tested. Historical journals dated by UTC are **reported** (drift endpoint), not rewritten.

## 10. Audit trail

Each mutating request writes its audit row **in the same transaction** (fail-closed). Sensitive handlers add `before/after` evidence and the real entity id
(users, employees/salary, payroll runs/adjustments, journal post/reverse, period close, payment adjustments, GRN/invoice approval, repair). Denied
attempts (403 / foreign-branch 404) are recorded as `DENIED`. `audit_logs` is append-only at DB level (UPDATE/DELETE/TRUNCATE rejected; only the FK
`SET NULL` cascade is tolerated). Never log secrets.

## 11. Customer receipt wording

Menu prices are VAT-inclusive (accepted Phase 3 decision, no order-level VAT posting). The customer receipt, dine-in bill and delivery receipt only state
“الأسعار شاملة ضريبة القيمة المضافة”. No VAT line, rate or amount was added.

## 12. Rollout checklist (owner)

1. Take a verified encrypted backup (`BACKUP_AND_RECOVERY.md`); run the restore drill against a scratch database.
2. Deploy the build; migration 057 runs automatically (additive). Confirm `GET /accounting/readiness` → `ready: true`, `enforcement: "strict"`.
3. `GET /accounting/reports/journal-coverage` and `/business-date-drift`: review with the accountant; run `POST /accounting/repair/journals` for confirmed gaps.
4. Make sure two privileged users exist (SoD). Confirm branch assignments of branch managers/cashiers (users without a branch are denied branch data).
5. Frontend impact: error bodies are unchanged (`{error}` / `{message}`); new statuses to surface: 403 (scope / SoD), 409 (state conflict), 503 (accounting not configured).
6. Security/GitHub actions: see `SECURITY_HARDENING.md` (private repo, environments `production-maintenance` / `production-backup`, secrets, rotation).
