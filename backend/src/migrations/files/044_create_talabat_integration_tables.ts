import { Kysely, sql } from "kysely";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

// تكامل Talabat - نفس مفهوم TAL-1..TAL-10 بالريبو القديم (docs/TALABAT-INTEGRATION.md) بالحرف: البنية
// الداخلية (webhook + idempotency + مزامنة أوردرات + إلغاء + مطابقة + لوحة تحكم) جاهزة ومختبرة بالكامل،
// بس الاتصال الفعلي بـTalabat نفسه (OAuth، شكل الـwebhook الحقيقي) لسه موقوف عمدًا لحد ما تتوفر مواصفة
// Talabat Partner API الحقيقية - نفس الفلسفة الحاكمة: PREVENT -> DETECT -> AUDIT، مش TRUST -> REVIEW.
export async function up(db: Kysely<unknown>): Promise<void> {
  // صف تتبّع 1:1 لكل أوردر Talabat - talabat_order_id UNIQUE، pos_order_id UNIQUE (لو اتسجّل أوردر POS
  // فعلي ليه) - الـUNIQUE بيضمن الـ1:1 على مستوى القاعدة نفسها، مش مجرد اتفاق كود
  await db.schema
    .createTable("talabat_orders")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("talabat_order_id", "text", (col) => col.notNull().unique())
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("pos_order_id", "uuid", (col) => col.unique().references("orders.id"))
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status IN ('RECEIVED','MAPPING_ERROR','IMPORTED','FAILED','CANCELED')`)
    )
    .addColumn("raw_payload", "jsonb", (col) => col.notNull())
    .addColumn("error_reason", "text")
    .addColumn("canceled_at", "timestamptz")
    .addColumn("cancellation_source", "text", (col) => col.check(sql`cancellation_source IN ('TALABAT','ORPHAN')`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_talabat_orders_branch").on("talabat_orders").column("branch_id").execute();

  // talabat_item_id -> menu_item/variant حقيقي (لكل فرع - نفس صنف Talabat ممكن يتربط بحجم مختلف حسب
  // الفرع). صنف مش موجود هنا وقت المزامنة = MAPPING_ERROR مرئي، مش تجاهل صامت
  await db.schema
    .createTable("talabat_product_mapping")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("talabat_item_id", "text", (col) => col.notNull())
    .addColumn("menu_item_id", "uuid", (col) => col.references("menu_items.id"))
    .addColumn("variant_id", "uuid", (col) => col.references("menu_item_variants.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("uq_talabat_product_mapping_branch_item", ["branch_id", "talabat_item_id"])
    .execute();

  // sha256(الجسم الخام) UNIQUE - إعادة إرسال حرفية لنفس الـwebhook (retry من Talabat نفسه) = "duplicate"
  // بدون أي معالجة تانية، من غير ما نعتمد على talabat_order_id لوحده (ممكن يتكرر جوّه أجسام مختلفة فعلًا)
  await db.schema
    .createTable("talabat_webhook_events")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("dedupe_key", "text", (col) => col.notNull().unique())
    .addColumn("raw_body", "jsonb", (col) => col.notNull())
    .addColumn("received_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // أي فشل في أي مرحلة (webhook/mapping/order-creation/cancellation) - مرئي ومتابع، مش مبتلع صامت
  await db.schema
    .createTable("talabat_integration_errors")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("stage", "text", (col) => col.notNull().check(sql`stage IN ('WEBHOOK','SYNC','CANCELLATION')`))
    .addColumn("talabat_order_id", "text")
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("context", "jsonb")
    .addColumn("retry_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_retry_at", "timestamptz")
    .addColumn("status", "text", (col) => col.notNull().check(sql`status IN ('OPEN','RETRYING','RESOLVED')`).defaultTo("OPEN"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_talabat_integration_errors_status").on("talabat_integration_errors").column("status").execute();

  // ربط فرع/طريقة دفع حقيقية بمعرّفات Talabat المقابلة - نفس عمودي branches.talabat_branch_id/
  // payment_methods.talabat_payment_code بالريبو القديم بالظبط
  await db.schema.alterTable("branches").addColumn("talabat_branch_id", "text").execute();
  await db.schema.createIndex("idx_branches_talabat_branch_id").on("branches").column("talabat_branch_id").unique().execute();

  await db.schema.alterTable("payment_methods").addColumn("talabat_payment_code", "text").execute();
  await db.schema
    .createIndex("idx_payment_methods_talabat_payment_code")
    .on("payment_methods")
    .column("talabat_payment_code")
    .unique()
    .execute();

  // مستخدم نظامي بينفّذ كل عملية مزامنة/إلغاء داخليًا (createdBy على الطلب) - كلمة سر عشوائية bcrypt
  // محدش يعرفها (نفس فلسفة talabat-integration@system.internal بالريبو القديم بالظبط)، role=admin
  // عشان يعدي أي تحقق صلاحية لو احتاج، branch_id=NULL لأنه مش تابع لفرع واحد
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  await db
    .insertInto("users" as never)
    .values({
      id: randomUUID(),
      branch_id: null,
      name: "تكامل Talabat (نظامي)",
      email: "talabat-integration@system.internal",
      password_hash: passwordHash,
      role: "admin",
      permission_grants: sql`'[]'::jsonb`,
      permission_revokes: sql`'[]'::jsonb`,
      is_active: false,
    } as never)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM users WHERE email = 'talabat-integration@system.internal'`.execute(db);
  await db.schema.dropIndex("idx_payment_methods_talabat_payment_code").execute();
  await db.schema.alterTable("payment_methods").dropColumn("talabat_payment_code").execute();
  await db.schema.dropIndex("idx_branches_talabat_branch_id").execute();
  await db.schema.alterTable("branches").dropColumn("talabat_branch_id").execute();
  await db.schema.dropTable("talabat_integration_errors").execute();
  await db.schema.dropTable("talabat_webhook_events").execute();
  await db.schema.dropTable("talabat_product_mapping").execute();
  await db.schema.dropTable("talabat_orders").execute();
}
