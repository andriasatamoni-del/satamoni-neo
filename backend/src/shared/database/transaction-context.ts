import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { DATABASE, type Database } from "./database.token";
import * as schema from "./schema";

// Phase 3.1 (BL-01..04, BL-08, BL-09): transaction & idempotency foundation.
//
// Every repository gets the same injected `Database` (token DATABASE). That object is a thin Proxy: when the current
// async call chain is inside `TransactionService.run()` it routes every query to that command's single database
// transaction, otherwise to the connection pool. So a command handler wraps its whole body in `tx.run(...)` and ALL
// repository writes (order, stock movements, payment, journals, ...) commit or roll back together, without changing
// any repository code or port. A nested `db.transaction(fn)` made by a repository simply joins the surrounding one.
//
// Drizzle runs the transaction itself (BEGIN / COMMIT / ROLLBACK and savepoints). This file only adds what Drizzle
// lacks: the ambient transaction above, the retry on deadlock / serialization failure, after-commit hooks and the
// advisory lock.

interface TxContext {
  db: Database;
  afterCommit: Array<() => Promise<void> | void>;
}

export const txStorage = new AsyncLocalStorage<TxContext>();

export const PG_POOL = Symbol("PG_POOL");

export function isInTransaction(): boolean {
  return txStorage.getStore() !== undefined;
}

// Run `fn` after the surrounding transaction COMMITS (never after a rollback). Outside a transaction it runs now.
export async function afterCommit(fn: () => Promise<void> | void): Promise<void> {
  const ctx = txStorage.getStore();
  if (ctx) ctx.afterCommit.push(fn);
  else await fn();
}

// Binds methods to whichever executor is active (the command transaction or the pool-backed instance).
function routeTo<T extends object>(base: T, pick: (ctx: TxContext) => object, joinTransaction: (ctx: TxContext) => unknown): T {
  return new Proxy(base, {
    get(target, prop) {
      const ctx = txStorage.getStore();
      if (ctx && prop === "transaction") return joinTransaction(ctx);
      const active = (ctx ? pick(ctx) : target) as Record<string | symbol, unknown>;
      const value = Reflect.get(active, prop, active);
      if (typeof value !== "function") return value;
      // Only METHODS (data properties on the prototype chain) are bound to the active executor. Getters that return
      // callable objects carrying their own properties must be returned untouched.
      for (let o: object | null = active as object; o; o = Object.getPrototypeOf(o)) {
        const d = Object.getOwnPropertyDescriptor(o, prop);
        if (d) return d.get ? value : (value as (...a: unknown[]) => unknown).bind(active);
      }
      return value;
    },
  });
}

export function createTransactionalDb(base: Database): Database {
  // Already inside the command transaction: a nested `db.transaction(fn)` just runs `fn` on it.
  return routeTo(base, (ctx) => ctx.db, (ctx) => <T>(fn: (tx: Database) => Promise<T>) => fn(ctx.db));
}

const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]); // deadlock_detected, serialization_failure
const MAX_ATTEMPTS = 3;

// Drizzle wraps driver errors in DrizzleQueryError (original error in `.cause`). This returns the PostgreSQL error
// itself, so callers can read its `code`, `constraint` and the message a trigger raised.
export function pgError(err: unknown): { code: string; message?: string; constraint?: string } | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | null | undefined, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    if (typeof e.code === "string") return e as { code: string; message?: string; constraint?: string };
  }
  return undefined;
}

export function pgErrorCode(err: unknown): string | undefined {
  return pgError(err)?.code;
}

// The message to log, store or show for any error. DrizzleQueryError's own message is the full SQL plus its bound
// parameters (password hashes, customer phones, addresses ...), so for a database error this is PostgreSQL's message.
export function dbErrorMessage(err: unknown): string {
  const pg = pgError(err);
  if (pg?.message) return pg.message;
  return err instanceof Error ? err.message : String(err);
}

const tablesByName = new Map<string, PgTable>(
  (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable)).map((t) => [getTableName(t), t])
);

/** A schema table by its SQL name (undefined for unknown names): for code that addresses tables by name from metadata. */
export function tableByName(name: string): PgTable | undefined {
  return tablesByName.get(name);
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // One business command = one transaction. Joins the surrounding one when nested. Deadlocks / serialization
  // failures (only possible between concurrent commands) are retried transparently up to 3 times.
  async run<T>(fn: () => Promise<T>, options: { retry?: boolean } = {}): Promise<T> {
    if (isInTransaction()) return fn();

    const maxAttempts = options.retry === false ? 1 : MAX_ATTEMPTS;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const callbacks: TxContext["afterCommit"] = [];
      let result: T;
      try {
        // outside a command the proxy routes to the pool: Drizzle takes a connection, BEGINs, and COMMITs / ROLLBACKs
        result = await this.db.transaction((tx) => txStorage.run({ db: tx as unknown as Database, afterCommit: callbacks }, fn));
      } catch (err) {
        lastError = err;
        const code = pgErrorCode(err);
        if (code && RETRYABLE_SQLSTATES.has(code) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 15 * attempt + Math.floor(Math.random() * 25)));
          continue;
        }
        throw err;
      }
      for (const cb of callbacks) {
        try {
          await cb();
        } catch (err) {
          // post-commit work is best-effort by definition (the business transaction already committed)
          this.logger.error(`post-commit callback failed: ${dbErrorMessage(err)}`);
        }
      }
      return result;
    }
    throw lastError;
  }

  // Runs `fn` as an independent unit INSIDE the current transaction using a Drizzle savepoint: if it throws, only its
  // own writes are rolled back (the caller can record the failure and continue with the next item). Outside a
  // transaction it is a normal run().
  async isolated<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = txStorage.getStore();
    if (!ctx) return this.run(fn);
    return ctx.db.transaction((sp) => txStorage.run({ ...ctx, db: sp as unknown as Database }, fn));
  }

  // Pessimistic row lock on an aggregate root (released at COMMIT/ROLLBACK). Take it FIRST, then read the aggregate:
  // under READ COMMITTED the following SELECT sees whatever the previous lock holder committed, so state checks
  // ("already confirmed / cancelled / approved") are race-free. Only tables defined in the schema can be locked.
  async lockRow(table: string, id: string): Promise<boolean> {
    this.assertInTransaction();
    const t = tablesByName.get(table);
    const idColumn = t ? (t as unknown as Record<string, PgColumn | undefined>).id : undefined;
    if (!t || !idColumn) throw new Error(`invalid table name: ${table}`);
    const rows = await this.db.select({ id: idColumn }).from(t).where(eq(idColumn, id)).for("update");
    return rows.length > 0;
  }

  // Serialises commands that share a logical key (e.g. an idempotency key) for the rest of the transaction.
  async advisoryLock(key: string): Promise<void> {
    this.assertInTransaction();
    await this.db.select({ locked: sql`pg_advisory_xact_lock(hashtextextended(${key}, 0))` }).from(sql`(VALUES (1)) AS lock_target`);
  }

  private assertInTransaction(): void {
    if (!isInTransaction()) throw new Error("lock requested outside a transaction (it would be released immediately)");
  }
}
