import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { DATABASE, type Database } from "./database.token";
import * as schema from "./schema";

interface TxContext {
  db: Database;
  afterCommit: Array<() => Promise<void> | void>;
}

export const txStorage = new AsyncLocalStorage<TxContext>();

export const PG_POOL = Symbol("PG_POOL");

export function isInTransaction(): boolean {
  return txStorage.getStore() !== undefined;
}

export async function afterCommit(fn: () => Promise<void> | void): Promise<void> {
  const ctx = txStorage.getStore();
  if (ctx) ctx.afterCommit.push(fn);
  else await fn();
}

function routeTo<T extends object>(base: T, pick: (ctx: TxContext) => object, joinTransaction: (ctx: TxContext) => unknown): T {
  return new Proxy(base, {
    get(target, prop) {
      const ctx = txStorage.getStore();
      if (ctx && prop === "transaction") return joinTransaction(ctx);
      const active = (ctx ? pick(ctx) : target) as Record<string | symbol, unknown>;
      const value = Reflect.get(active, prop, active);
      if (typeof value !== "function") return value;
      for (let o: object | null = active as object; o; o = Object.getPrototypeOf(o)) {
        const d = Object.getOwnPropertyDescriptor(o, prop);
        if (d) return d.get ? value : (value as (...a: unknown[]) => unknown).bind(active);
      }
      return value;
    },
  });
}

export function createTransactionalDb(base: Database): Database {
  return routeTo(base, (ctx) => ctx.db, (ctx) => <T>(fn: (tx: Database) => Promise<T>) => fn(ctx.db));
}

const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);
const MAX_ATTEMPTS = 3;

export function pgError(err: unknown): { code: string; message?: string; constraint?: string } | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | null | undefined, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    if (typeof e.code === "string") return e as { code: string; message?: string; constraint?: string };
  }
  return undefined;
}

export function pgErrorCode(err: unknown): string | undefined {
  return pgError(err)?.code;
}

export function dbErrorMessage(err: unknown): string {
  const pg = pgError(err);
  if (pg?.message) return pg.message;
  return err instanceof Error ? err.message : String(err);
}

const tablesByName = new Map<string, PgTable>(
  (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable)).map((t) => [getTableName(t), t])
);

export function tableByName(name: string): PgTable | undefined {
  return tablesByName.get(name);
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(fn: () => Promise<T>, options: { retry?: boolean } = {}): Promise<T> {
    if (isInTransaction()) return fn();

    const maxAttempts = options.retry === false ? 1 : MAX_ATTEMPTS;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const callbacks: TxContext["afterCommit"] = [];
      let result: T;
      try {
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
          this.logger.error(`post-commit callback failed: ${dbErrorMessage(err)}`);
        }
      }
      return result;
    }
    throw lastError;
  }

  async isolated<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = txStorage.getStore();
    if (!ctx) return this.run(fn);
    const savepointCallbacks: TxContext["afterCommit"] = [];
    const result = await ctx.db.transaction((sp) => txStorage.run({ db: sp as unknown as Database, afterCommit: savepointCallbacks }, fn));
    ctx.afterCommit.push(...savepointCallbacks);
    return result;
  }

  async lockRow(table: string, id: string): Promise<boolean> {
    this.assertInTransaction();
    const t = tablesByName.get(table);
    const idColumn = t ? (t as unknown as Record<string, PgColumn | undefined>).id : undefined;
    if (!t || !idColumn) throw new Error(`invalid table name: ${table}`);
    const rows = await this.db.select({ id: idColumn }).from(t).where(eq(idColumn, id)).for("update");
    return rows.length > 0;
  }

  async advisoryLock(key: string): Promise<void> {
    this.assertInTransaction();
    await this.db.select({ locked: sql`pg_advisory_xact_lock(hashtextextended(${key}, 0))` }).from(sql`(VALUES (1)) AS lock_target`);
  }

  private assertInTransaction(): void {
    if (!isInTransaction()) throw new Error("lock requested outside a transaction (it would be released immediately)");
  }
}
