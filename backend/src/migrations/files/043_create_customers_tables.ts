import { Kysely, sql } from "kysely";

// Customer/CustomerAddress - نفس مفهوم customers+customer_addresses في الريبو القديم (المرحلة 8.38):
// حساب عميل حقيقي (رقم تليفون + كلمة سر) اختياري تمامًا لموقع الطلب - عميل ضيف من غير حساب يفضل شغال
// عادي، وpassword_hash=NULL يعني لسه ضيف. حظر العميل (is_blocked) بيانات مرجعية هنا بس - مفيش مسار
// طلب عام في neo لسه يستهلكه (راجع تعليق customer.aggregate.ts)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("customers")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("phone", "text", (col) => col.notNull().unique())
    .addColumn("phone2", "text")
    .addColumn("name", "text")
    .addColumn("address_details", "text")
    .addColumn("distinguishing_mark", "text")
    .addColumn("notes", "text")
    .addColumn("loyalty_points", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("password_hash", "text")
    .addColumn("is_blocked", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("block_reason", "text")
    .addColumn("blocked_by", "uuid", (col) => col.references("users.id"))
    .addColumn("blocked_at", "timestamptz")
    .addColumn("legacy_customer_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("customer_addresses")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("customer_id", "uuid", (col) => col.notNull().references("customers.id").onDelete("cascade"))
    .addColumn("label", "text")
    .addColumn("address_details", "text", (col) => col.notNull())
    .addColumn("distinguishing_mark", "text")
    .addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_customer_addresses_customer").on("customer_addresses").column("customer_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("customer_addresses").execute();
  await db.schema.dropTable("customers").execute();
}
