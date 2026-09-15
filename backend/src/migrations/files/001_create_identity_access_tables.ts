import { Kysely, sql } from "kysely";

// نفس مفهوم users في الريبو القديم (db/schema.sql) بس بschema جديد نضيف فيه:
// - id UUID بدل SERIAL (سهل لو أي context لاحقًا احتاج يبقى خدمة منفصلة - مفيش تعارض IDs بين خدمات)
// - legacy_user_id للتتبّع وقت استيراد بيانات المستخدمين من الريبو القديم (NEO-5) - مش foreign key
//   (القاعدة القديمة منفصلة تمامًا)، بس عمود عادي يسهّل مطابقة أي صف استوردناه بمصدره الأصلي
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);

  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("branch_id", "uuid")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) =>
      col.notNull().check(
        sql`role IN ('admin','branch_manager','accountant','cashier','callcenter','driver','employee')`
      )
    )
    .addColumn("permission_grants", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("permission_revokes", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("pin_hash", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_user_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // نفس فكرة event_outbox في خطة إعادة البناء (services/events/event-bus.service.ts) - سجل دائم لكل
  // حدث دومين اتنشر، مفيدة كسجل تدقيق دلوقتي وكأساس لـrelay موثوق لما يظهر أول context محتاجه فعليًا
  await db.schema
    .createTable("event_outbox")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("event_name", "text", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("occurred_at", "timestamptz", (col) => col.notNull())
    .addColumn("recorded_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("event_outbox").execute();
  await db.schema.dropTable("users").execute();
}
