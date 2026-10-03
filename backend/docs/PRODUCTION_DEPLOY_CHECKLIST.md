# Production Deploy Checklist (first production deploy)

## Purpose

A step-by-step go/no-go checklist for the **first** deploy of Satamoni Neo to production. Each box is meant to be ticked by the person running the deploy, in order.

## Scope

Covers the Render deployment described in `DEPLOYMENT.md`, with the Phase 3.1 changes (migration `057`, strict accounting, branch isolation, segregation of duties) and the GitHub-side security setup.
It does **not** change any code, schema, migration or Render configuration; it only describes what to verify and do.

## Production readiness principle

> **No real data goes in until every "Before deploying" box is ticked and the post-deploy checks pass.**
> Any item marked **STOP** is a hard stop: do not continue, and do not let cashiers start working, until it is resolved.
> When in doubt, stop and roll back; the previous system stays running as the fallback.

## Reference documents

- [`backend/docs/SECURITY_HARDENING.md`](SECURITY_HARDENING.md): GitHub security setup, credential rotation, repository visibility
- [`DEPLOYMENT.md`](../../DEPLOYMENT.md): Render deployment steps, environment variables, final import
- [`backend/docs/PHASE31_REMEDIATION.md`](PHASE31_REMEDIATION.md): what Phase 3.1 guarantees and the operator runbook (accounting enforcement, repair, branch scope, SoD)
- [`backend/docs/BACKUP_AND_RECOVERY.md`](BACKUP_AND_RECOVERY.md): backup workflow, retention, restore drill

---

## 1. Before deploying (all boxes must be ticked)

### Security

- [ ] The repository is **private**.
- [ ] Two GitHub environments exist: `production-maintenance` and `production-backup`, each with a **required reviewer**.
- [ ] Secrets live **inside the environments**, not at repository level: `DATABASE_URL`, `LEGACY_DATABASE_URL` (maintenance), and `BACKUP_ENCRYPTION_KEY` (at least 32 characters).
- [ ] The new `JWT_SECRET` is randomly generated and was never used before.
- [ ] Any old database password has been changed (treat the old one as compromised).
- [ ] The account `admin-test@satamoni.local` does not exist, or is disabled, in production. (`backend/scripts/audit-test-account.ts` can check this; it only reads.)
- [ ] Branch protection is enabled on `main`.

### Infrastructure

- [ ] In `render.yaml` the database is **not** on `plan: free` (the free plan expires and has no backups, so it is not suitable for real data). Use a paid plan.
- [ ] Render database backups are enabled (paid plan).
- [ ] Backend environment variables are set:
  - [ ] `DATABASE_URL`
  - [ ] `PGSSL`
  - [ ] `JWT_SECRET`
  - [ ] `JWT_EXPIRES_IN`
  - [ ] `FRONTEND_ORIGIN` (exactly the frontend URL, with no trailing `/`)
  - [ ] `ACCOUNTING_ENFORCEMENT=strict`
- [ ] If the WhatsApp/Messenger bot, SMS or online storefront will be used, their variables are set (all optional; each is off without its keys).

### Backup

- [ ] The backup workflow has been run manually once (**Actions → Daily database backup + restore drill → Run workflow**), it succeeded, and an encrypted `.dump.gpg` artifact was produced.
- [ ] A **restore** from that backup has been tested on a throw-away database. (The workflow itself had never run on GitHub before this checklist.)

### Accounting

- [ ] The accountant has reviewed how payment adjustments are posted: the amount difference is posted as a cash variance (account 6950); a method-only change has no ledger effect. (This is a decision taken from the existing requirements and needs confirmation.)
- [ ] The chart of accounts contains the required accounts:

  | Code | Purpose |
  |---|---|
  | 1100 | Cash |
  | 1400 | Inventory |
  | 2100 | Suppliers (payables) |
  | 2400 | Accrued payroll |
  | 4100 | Sales revenue |
  | 5100 | Cost of goods sold |
  | 6100 | Payroll expense |
  | 6950 | Cash variances |

### People

- [ ] At least **two users with elevated privileges** exist (for example admin + accountant). Because of segregation of duties, nobody can approve what they registered themselves (payroll runs, payment adjustments, supplier invoices).
- [ ] Every branch manager and cashier is **assigned to a branch**. A user without a branch cannot see any branch data.

> **STOP** if any box above is unticked. Do not deploy.

---

## 2. During the deploy

- [ ] Take a last verified encrypted backup before touching anything (if there is existing data).
- [ ] Deploy the **backend**. Migration `057` runs automatically before start (it is additive).
- [ ] Deploy the **frontend**.
- [ ] If importing from the old system, run the operations from **Actions → Approved maintenance operation → Run workflow**, **in this order**, one at a time, each approved by the reviewer:
  1. `import-branches`
  2. `import-users`
  3. `import-crm`
  4. `import-inventory`
  5. `import-catalog`
  6. `import-procurement`
  7. `import-orders`
  8. `import-drivers`
  9. `import-accounting`
  10. `import-payment-control`
  11. `import-hr-payroll`

  (Each import is idempotent. See `DEPLOYMENT.md`, section 4. The workflow also offers `import-customers`, which `DEPLOYMENT.md` does not list in its order; confirm with the owner whether it is needed.)

---

## 3. Post-deploy checks (in this order)

Use an admin token (`$TOKEN`) and your backend URL (`$API`).

- [ ] **Health**

  ```bash
  curl -s "$API/health"
  # expected: {"status":"ok"}
  ```

- [ ] **Login** with a real admin account works.

- [ ] **Accounting readiness**

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/accounting/readiness"
  # expected: "ready": true  and  "enforcement": "strict"
  ```

  > **STOP** if `ready` is `false`. A required account is missing, so any order that posts a journal will be rejected with 503. Add the missing account(s) before any cashier works.

- [ ] **Journal coverage** (transactions that should have a journal but do not)

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/accounting/reports/journal-coverage"
  ```

  Review any gaps with the accountant. Repost **confirmed** gaps only:

  ```bash
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{}' "$API/accounting/repair/journals"
  ```

- [ ] **Business-date drift** (older journals dated by UTC; reported, never rewritten)

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/accounting/reports/business-date-drift"
  ```

- [ ] **Smoke test (sale and cancel)**
  1. Register an order paid in cash.
  2. Confirm both the sale journal and the cost-of-goods journal were created.
  3. Cancel the order.
  4. The trial balance returns to the values it had before (no negative revenue left behind).

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/accounting/reports/trial-balance"
  # totalDebit must equal totalCredit
  ```

- [ ] **Branch isolation:** a cashier of branch A requesting branch B data gets **403**.
- [ ] **Segregation of duties:** approving a payroll run with the same user who registered it gets **403**; with a different user it succeeds.
- [ ] **Action Center:** after the first day, check for `MISSING_JOURNALS` and `ACCOUNTING_NOT_CONFIGURED` alerts.

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/reports/action-center"
  ```

> **GO** only when every check above passes. Otherwise follow section 4.

---

## 4. Stop and rollback criteria

**STOP and do not continue if any of these is true:**

- [ ] `GET /accounting/readiness` is not `ready: true`.
- [ ] A normal order returns a `5xx` error.
- [ ] The trial balance is not balanced (`totalDebit ≠ totalCredit`).

**Rollback:**

- Cheapest option: redeploy the **previous build** in Render. Migration `057` is additive, but a previous build against the new schema has **not been tested**, so try it on a copy first.
- `npm run migrate:down` reverts migration `057` only. It was tested on sample data only; confirm it does not lose data written after the migration before using it in production.
- The real safety net is the **backup taken in section 2**.
- Keep the old system (`satamoni-backend`) running as the fallback until you are confident (see `DEPLOYMENT.md`, sections 6 and 7).

---

## 5. First week after deploy

- [ ] Watch errors and user complaints daily.
- [ ] Every day, review `journal-coverage` and look in `audit_logs` for unexpected `DENIED` rows.
- [ ] Confirm the daily backup ran successfully each day.
- [ ] Once you are confident, switch the old system to read-only instead of stopping it abruptly.
