import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./database.types";
import { pgSslOption } from "./pg-ssl";

export const KYSELY = Symbol("KYSELY");

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
          pool: new Pool({ connectionString, max: 10, ssl: pgSslOption() }),
        });
        return new Kysely<Database>({ dialect });
      },
    },
  ],
  exports: [KYSELY],
})
export class DatabaseModule {}
