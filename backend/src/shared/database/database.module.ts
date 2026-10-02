import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./database.types";
import { pgSslOption } from "./pg-ssl";
import { KYSELY } from "./kysely.token";
import { TransactionService, createTransactionalDb } from "./transaction-context";

export { KYSELY };

// اتصال Postgres واحد مشترك بين كل الـcontexts - نفس فلسفة db/pool.js في الريبو القديم
// (pool واحد بيتشارك، مش اتصال جديد لكل context). Kysely بس، مش ORM كامل - عمدًا (راجع خطة
// إعادة البناء، قسم 3: الـschema هتعتمد على triggers/constraints حقيقية في Postgres زي القديم بالظبط،
// وORM كامل بيتعارك مع الأسلوب ده).
@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      useFactory: (): Kysely<Database> => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("لازم تحدد DATABASE_URL في متغيرات البيئة");
        }
        const dialect = new PostgresDialect({
          // BL-12: sessions stay in UTC (so JS Date parameters compare predictably with `date` columns); every place that needs the
          // Cairo BUSINESS day says so explicitly (`AT TIME ZONE 'Africa/Cairo'` via businessDateSql, or the TS helpers in
          // shared/time/business-date.ts). All stored timestamps are timestamptz, so no stored value depends on a session zone.
          pool: new Pool({ connectionString, max: 10, ssl: pgSslOption(), connectionTimeoutMillis: 10_000 }),
        });
        // Proxy that joins the current command transaction (see transaction-context.ts)
        return createTransactionalDb(new Kysely<Database>({ dialect }));
      },
    },
    TransactionService,
  ],
  exports: [KYSELY, TransactionService],
})
export class DatabaseModule {}
