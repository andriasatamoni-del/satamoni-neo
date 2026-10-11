import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Kysely, PostgresDialect } from "kysely";
import type { Transaction } from "kysely";
import type { Pool, PoolClient } from "pg";
import type { Database as KyselyDatabase } from "./database.types";
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
//
// TEMPORARY (Kysely -> Drizzle migration): while contexts are ported one by one, a command can still touch Kysely
// repositories. So run() borrows ONE connection, starts the Drizzle transaction on it, and also pins a Kysely instance
// to the same connection; both libraries then share a single transaction. Remove the Kysely half (and PG_POOL use
// here) once the last context is ported.

interface TxContext {
  db: Database;
  kysely: Kysely<KyselyDatabase>;
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
      // callable objects carrying their own properties (Kysely's `db.fn`) must be returned untouched.
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

// TEMPORARY: the Kysely side of the bridge (see the header). Deleted with the last Kysely repository.
export function createTransactionalKysely(base: Kysely<KyselyDatabase>): Kysely<KyselyDatabase> {
  return routeTo(base, (ctx) => ctx.kysely, (ctx) => () => {
    const builder = {
      execute: <T>(fn: (trx: Transaction<KyselyDatabase>) => Promise<T>) => fn(ctx.kysely as unknown as Transaction<KyselyDatabase>),
      setIsolationLevel: () => builder,
      setAccessMode: () => builder,
    };
    return builder;
  });
}

// A pool-shaped wrapper that always hands out the one connection already inside the transaction (release is a no-op;
// TransactionService releases the real connection). `query` must run with `this` = the real client: pg keeps the
// active-query state on the client object, so a prototype-derived copy would desynchronise the protocol.
function singleConnectionPool(client: PoolClient) {
  const borrowed = { query: client.query.bind(client), release: () => undefined } as unknown as PoolClient;
  return {
    connect: async () => borrowed,
    end: async () => undefined,
  };
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

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool
  ) {}

  // One business command = one transaction. Joins the surrounding one when nested. Deadlocks / serialization
  // failures (only possible between concurrent commands) are retried transparently up to 3 times.
  async run<T>(fn: () => Promise<T>, options: { retry?: boolean } = {}): Promise<T> {
    if (isInTransaction()) return fn();

    const maxAttempts = options.retry === false ? 1 : MAX_ATTEMPTS;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const callbacks: TxContext["afterCommit"] = [];
      let result: T;
      const client = await this.pool.connect();
      let broken: Error | undefined;
      try {
        const kysely = new Kysely<KyselyDatabase>({ dialect: new PostgresDialect({ pool: singleConnectionPool(client) }) });
        result = await drizzle(client, { schema }).transaction((tx) =>
          txStorage.run({ db: tx as unknown as Database, kysely, afterCommit: callbacks }, fn)
        );
      } catch (err) {
        lastError = err;
        const code = pgErrorCode(err);
        if (!code) broken = err instanceof Error ? err : undefined;
        if (code && RETRYABLE_SQLSTATES.has(code) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 15 * attempt + Math.floor(Math.random() * 25)));
          continue;
        }
        throw err;
      } finally {
        // A connection that failed for a non-SQL reason is discarded instead of going back to the pool.
        client.release(broken && /connection|terminat|ECONN/i.test(broken.message) ? broken : undefined);
      }
      for (const cb of callbacks) {
        try {
          await cb();
        } catch (err) {
          // post-commit work is best-effort by definition (the business transaction already committed)
          this.logger.error(`post-commit callback failed: ${err instanceof Error ? err.message : err}`);
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
