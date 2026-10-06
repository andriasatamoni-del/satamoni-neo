# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

satamoni-neo is a restaurant ERP. It rebuilds the legacy `satamoni-backend` system and covers POS/orders, kitchen display, inventory, procurement, accounting, payroll, delivery, CRM, an online storefront and a WhatsApp/Meta bot. There are two independent npm packages, with no root workspace:

- `backend/`: NestJS 10 + Kysely + PostgreSQL. A DDD **modular monolith**.
- `frontend/`: React 18 + Vite 6 + React Router 7 + TanStack Query + Tailwind 4. An SPA.

Code comments and docs are mostly in Egyptian Arabic. Newer Phase 3.1 code is commented in English. Match the language of the file you edit. User-facing strings and permission labels are in Arabic.

## Commands

Run every command from inside `backend/` or `frontend/`. CI (`.github/workflows/ci.yml`) uses `npm ci` with Node 22. pnpm lockfiles also exist, but npm is the canonical tool.

### Backend
```bash
npm run start:dev                 # watch mode, port 4100 (PORT); needs backend/.env (copy .env.example)
npm run migrate                   # apply Kysely migrations (src/migrations/files); `migrate:down` reverts one
npm run build                     # nest build -> dist/
npx tsc --noEmit -p tsconfig.json # typecheck (CI gate; there is no linter configured)

npm run test:unit                 # test/unit/**/*.spec.ts: pure domain logic, no DB, no Nest bootstrap
npm run test:integration          # test/integration/**/*.spec.ts: real Postgres + full Nest app via supertest
npx jest test/unit/orders/some.spec.ts                                     # single unit spec
npx jest -c jest.integration.config.js test/integration/orders/some.spec.ts # single integration spec
npx jest -c jest.integration.config.js -t "name of test"                   # filter by test name
```

How the integration tests run:
- They connect to `TEST_DATABASE_URL`, which defaults to `postgresql://postgres:test123@localhost:5432/satamoni_neo_test`. `global-setup.js` **drops the `public` schema and re-runs all migrations on every run**, even a run of a single file.
- `test/safety/assert-disposable-db.js` refuses to run unless the host is local and the database name contains `test`, `scratch`, `disposable` or `ci`. Never weaken this guard. Never point tests at a real database.
- `test/integration/setup.ts` sets `ACCOUNTING_ENFORCEMENT=deferred`, raises all throttle limits and deletes every external-service key, so tests never call Gemini, Meta or SMS. The Phase 3.1 suites (`test/integration/phase31/`) switch to `strict` themselves.
- The legacy-import specs need an extra empty database: `CREATE DATABASE satamoni_legacy_fixture_test`.
- The backup/restore drill specs need `pg_dump`/`pg_restore` at the same major version as the server (Postgres 17) on `PATH`.
- Suites run serially (`maxWorkers: 1`). CI adds `--forceExit`.

### Frontend
```bash
npm run dev     # Vite on :5173; proxies /api/* -> http://localhost:4100 (override with VITE_API_PROXY_TARGET)
npm run build   # tsc && vite build (this is the typecheck; CI gate)
```

## Backend architecture

### Bounded contexts
Every folder in `backend/src/contexts/<name>/` is a Nest module with the same layers:

- `domain/`: aggregates, domain errors, events (`events/*.event.ts`) and repository **ports**. A port is an interface plus a DI token such as `ORDER_REPOSITORY`.
- `application/commands|queries/`: one handler class per use case, with an `execute()` method.
- `infrastructure/persistence/`: Kysely repositories that implement the ports, and `*.schema.ts` table types.
- `api/`: controllers, DTOs (class-validator; the global `ValidationPipe` uses `whitelist` + `transform`) and per-context domain-error filters.
- `<name>.module.ts`: binds ports to implementations. In `onModuleInit()` it also **registers its permission group and role defaults** with `PermissionRegistry` and **subscribes to other contexts' events**.

Contexts talk to each other through domain events on `EventBusService`, or by importing another module's exported handlers and ports. New contexts must be added to `app.module.ts`.

### Database
- Kysely only, with no ORM. This is deliberate: integrity lives in real Postgres constraints and triggers.
- Each table type in a context's `*.schema.ts` must be composed into the `Database` interface in `src/shared/database/database.types.ts` by hand.
- Migrations are numbered files in `src/migrations/files/` (`NNN_description.ts`, with `up`/`down`). They are forward-only and additive. Kysely runs each one in a transaction. Production runs `npm run migrate` before every start.

### Transactions (`src/shared/database/transaction-context.ts`)
- The injected `KYSELY` instance is a Proxy backed by `AsyncLocalStorage`. Inside `TransactionService.run(fn)`, *every* repository query automatically joins that single transaction, and nested `db.transaction()` calls join it too. **One business command = one transaction.**
- Command handlers wrap their body in `tx.run(...)`. Deadlocks and serialization failures are retried up to 3 times.
- `tx.lockRow(table, id)`: `SELECT … FOR UPDATE`. Take the lock first, then read the aggregate.
- `tx.advisoryLock(key)`: serializes work on idempotency keys.
- `tx.isolated(fn)`: runs `fn` under a savepoint.
- `afterCommit(fn)`: runs `fn` only after the commit succeeds.

### Domain events (`src/shared/events/event-bus.service.ts`)
- This is an in-process bus. `publish()` writes a row to `event_outbox` inside the current transaction. There is no outbox relay.
- `subscribe(name, handler, { critical: true })` runs the handler **inline in the publisher's transaction**, and its errors roll the whole command back. Use this for anything financial: journal postings in `accounting.module.ts`, the payment lock and payment-method sync.
- Non-critical subscribers (printing, notifications, loyalty) run after commit. Their errors are only logged.

### Accounting enforcement
`ACCOUNTING_ENFORCEMENT` (see `accounting/application/services/accounting-posting.service.ts`) has two modes:
- `strict` is the default and is required in production. If a financial command's chart-of-accounts entries are missing, it fails with a 503 and rolls back.
- `deferred` exists only for migration/import and the older tests. The command succeeds, and the missing posting appears in `GET /accounting/reports/journal-coverage`. You can repost it with `POST /accounting/repair/journals`.

Partial unique indexes (migration 057) guarantee one auto-journal per (source type, source id) and one reversal per entry. The full rationale is in `backend/docs/PHASE31_REMEDIATION.md`.

### Authorization
Controllers use `@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)` plus `@RequirePermission(...keys)`. The guards live in `contexts/identity-access/api/guards/`.

Branch isolation lives in `src/shared/authorization/branch-scope.ts`:
- Scope is derived only from the user's server-side role and `users.branch_id`. It never comes from client input or from permissions.
- `admin` and `accountant` are company-wide. `callcenter` is company-wide only when it has no branch. Every other role is branch-bound and fails closed.
- Mark controllers `@BranchScoped()`. Mark by-id routes `@BranchResource("<table>")`. A foreign-branch id returns 404, and a foreign `branchId` parameter returns 403 with a DENIED audit row.
- Collection responses are filtered by the global `BranchListFilterInterceptor`.

Every new branch-owned endpoint needs these decorators. `test/integration/phase31/branch-isolation.e2e.spec.ts` covers this.

`audit_logs` is append-only and enforced by a DB trigger.

### Time
The business day is the **Africa/Cairo calendar date**. The process and DB sessions run in UTC, and `main.ts` pins `TZ=UTC`. Always use `src/shared/time/business-date.ts` (`businessDate()`, `businessDateString()`) or `businessDateSql()` in SQL. Never use `toISOString().slice(0,10)` or `::date` on a timestamp, because that puts late-night sales on the wrong day or month.

### Other backend notes
- `main.ts` enables `rawBody` for Talabat webhook HMAC verification. It sets CORS from `FRONTEND_ORIGIN` (comma-separated, default `http://localhost:5173`).
- Throttling: a global limit (`THROTTLE_LIMIT`, default 100/min) plus tighter per-route limits (`THROTTLE_LOGIN_LIMIT`, `THROTTLE_STOREFRONT_ORDER_LIMIT`).
- Optional integrations (WhatsApp/Meta bot via Gemini, SMS, storefront) degrade gracefully when their env vars are unset. See `backend/docs/WHATSAPP-BOT.md` and `STOREFRONT.md`.

## Frontend architecture

- `src/App.tsx` holds the routes. Pages live in `src/pages/` (one page per backend context, plus `portal/` and `storefront/` for the customer-facing `/order` site).
- `src/shared/api/client.ts`: the staff API client. It stores the JWT in localStorage (`satamoni-neo:token`) and uses `VITE_API_BASE_URL` as its base URL, falling back to `/api` so the Vite proxy handles requests in dev. `customerClient.ts` is the separate client for storefront customer auth.
- `src/shared/auth/AuthContext.tsx`: auth state and permissions.
- `src/shared/offline/`: offline cashier mode. IndexedDB queue plus `useOfflineSync`. `public/sw.js` caches the UI so the orders page can open without network.

## Legacy import & operations

- `backend/scripts/import-*-from-legacy.ts` read the old database (`LEGACY_DATABASE_URL`, read-only). They are idempotent and **must run in the dependency order listed in `DEPLOYMENT.md` §4**: branches → users → crm → inventory → catalog → procurement → orders → drivers → accounting → payment-control → hr-payroll.
- Production operations run only through `.github/workflows/maintenance-operation.yml`. It offers a fixed operation list and is gated by the `production-maintenance` environment, which requires a reviewer. Do not reintroduce a workflow that runs arbitrary scripts with production secrets. See `backend/docs/SECURITY_HARDENING.md`.
- Backups: `npm run backup` and `npm run restore-drill`, plus the daily `db-backup.yml` workflow. See `backend/docs/BACKUP_AND_RECOVERY.md`.
- Deployment target is Render (`render.yaml`, `DEPLOYMENT.md`): the backend runs as a Node web service and the frontend as a static site with a `/* → /index.html` rewrite.
