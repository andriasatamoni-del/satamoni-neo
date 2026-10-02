import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "./database.types";
import { KYSELY } from "./kysely.token";

// Phase 3.1 (BL-01..04, BL-08, BL-09): transaction & idempotency foundation.
//
// Every repository in the system gets the same injected `Kysely<Database>` (token KYSELY). That object is a thin
// Proxy: when the current async call chain is inside `TransactionService.run()` it transparently routes every query
// to that command's single database transaction, otherwise to the connection pool. So a command handler can wrap its
// whole body in `tx.run(...)` and ALL repository writes (order, stock movements, payment, journals, ...) commit or
// roll back together - without changing any repository code or port. Nested `db.transaction().execute()` calls made
// by repositories simply join the surrounding transaction.
//
// This replaces correctness-by-hope (separate transactions per step + swallowed subscriber errors) with one atomic unit
// per business command, which is what the concurrency / failure-injection tests in Phase 3.1 prove.

interface TxContext {
  trx: Transaction<Database>;
  afterCommit: Array<() => Promise<void> | void>;
}

export const txStorage = new AsyncLocalStorage<TxContext>();

export function currentTransaction(): Transaction<Database> | undefined {
  return txStorage.getStore()?.trx;
}

export function isInTransaction(): boolean {
  return txStorage.getStore() !== undefined;
}

// Run `fn` after the surrounding transaction COMMITS (never after a rollback). Outside a transaction it runs now.
export async function afterCommit(fn: () => Promise<void> | void): Promise<void> {
  const ctx = txStorage.getStore();
  if (ctx) ctx.afterCommit.push(fn);
  else await fn();
}

export function createTransactionalDb(base: Kysely<Database>): Kysely<Database> {
  return new Proxy(base, {
    get(target, prop) {
      const ctx = txStorage.getStore();
      const active = (ctx ? ctx.trx : target) as unknown as Record<string | symbol, unknown>;

      if (ctx && prop === "transaction") {
        // Already inside the command transaction: a nested `transaction().execute(fn)` just runs `fn` on it.
        return () => {
          const builder = {
            execute: <T>(fn: (trx: Transaction<Database>) => Promise<T>) => fn(ctx.trx),
            setIsolationLevel: () => builder,
            setAccessMode: () => builder,
          };
          return builder;
        };
      }
      if (ctx && prop === "destroy") return () => Promise.reject(new Error("destroy() inside a transaction"));

      const value = Reflect.get(active, prop, active);
      if (typeof value !== "function") return value;
      // Only METHODS (data properties on the prototype chain) are bound to the active executor. Getters such as `db.fn`
      // (a callable object carrying .countAll()/.sum()/...) must be returned untouched or their properties are lost.
      for (let o: object | null = active as object; o; o = Object.getPrototypeOf(o)) {
        const d = Object.getOwnPropertyDescriptor(o, prop);
        if (d) return d.get ? value : (value as (...a: unknown[]) => unknown).bind(active);
      }
      return value;
    },
  }) as Kysely<Database>;
}

const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]); // deadlock_detected, serialization_failure
const MAX_ATTEMPTS = 3;

export function pgErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

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
        result = await this.db.transaction().execute((trx) => txStorage.run({ trx, afterCommit: callbacks }, fn));
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
          this.logger.error(`post-commit callback failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      return result;
    }
    throw lastError;
  }

  // Runs `fn` as an independent unit INSIDE the current transaction using a SAVEPOINT: if it throws, only its own writes are
  // rolled back (the caller can record the failure and continue with the next item). Outside a transaction it is a normal run().
  private savepointSeq = 0;
  async isolated<T>(fn: () => Promise<T>): Promise<T> {
    if (!isInTransaction()) return this.run(fn);
    const name = `sp_${++this.savepointSeq}_${Date.now() % 100000}`;
    await sql.raw(`SAVEPOINT ${name}`).execute(this.db);
    try {
      const result = await fn();
      await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(this.db);
      return result;
    } catch (err) {
      await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(this.db);
      throw err;
    }
  }

  // Pessimistic row lock on an aggregate root (released at COMMIT/ROLLBACK). Take it FIRST, then read the aggregate:
  // under READ COMMITTED the following SELECT sees whatever the previous lock holder committed, so state checks
  // ("already confirmed / cancelled / approved") are race-free. Table names are validated, never interpolated blindly.
  async lockRow(table: string, id: string): Promise<boolean> {
    this.assertInTransaction();
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`invalid table name: ${table}`);
    const res = await sql<{ id: string }>`SELECT id FROM ${sql.table(table)} WHERE id = ${id} FOR UPDATE`.execute(this.db);
    return res.rows.length > 0;
  }

  // Serialises commands that share a logical key (e.g. an idempotency key) for the rest of the transaction.
  async advisoryLock(key: string): Promise<void> {
    this.assertInTransaction();
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.db);
  }

  private assertInTransaction(): void {
    if (!isInTransaction()) throw new Error("lock requested outside a transaction (it would be released immediately)");
  }
}
