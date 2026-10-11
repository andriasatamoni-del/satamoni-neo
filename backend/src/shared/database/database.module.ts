import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgSslOption } from "./pg-ssl";
import { DATABASE, type Database } from "./database.token";
import * as schema from "./schema";
import { PG_POOL, TransactionService, createTransactionalDb } from "./transaction-context";

export { DATABASE };

// اتصال Postgres واحد مشترك بين كل الـcontexts - نفس فلسفة db/pool.js في الريبو القديم (pool واحد بيتشارك، مش
// اتصال جديد لكل context). الاستعلامات بـDrizzle (الـschema في *.tables.ts هي مصدر الأنواع الوحيد)، بس سلامة
// البيانات لسه في Postgres نفسه: constraints وtriggers حقيقية في الـmigrations، مش في كود التطبيق.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("DATABASE_URL is not set. Add it to the environment (see backend/.env.example)");
        }
        // BL-12: sessions stay in UTC (so JS Date parameters compare predictably with `date` columns); every place that needs the
        // Cairo BUSINESS day says so explicitly (`AT TIME ZONE 'Africa/Cairo'` via businessDateSql, or the TS helpers in
        // shared/time/business-date.ts). All stored timestamps are timestamptz, so no stored value depends on a session zone.
        return new Pool({ connectionString, max: 10, ssl: pgSslOption(), connectionTimeoutMillis: 10_000 });
      },
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      // Proxy that joins the current command transaction (see transaction-context.ts)
      useFactory: (pool: Pool): Database => createTransactionalDb(drizzle(pool, { schema })),
    },
    TransactionService,
  ],
  exports: [PG_POOL, DATABASE, TransactionService],
})
export class DatabaseModule {}
