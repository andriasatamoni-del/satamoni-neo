import { Kysely, sql } from "kysely";

// CRM & Complaints bounded context - أول context بعد Identity & Access. بيوحّد جدولين كانوا منفصلين في
// الريبو القديم (customer_complaints + whatsapp_complaints - نفس الشكل بالظبط، بيختلفوا في قناة
// الدخول بس) في جدول واحد بعمود channel، بدل جدولين شبه متطابقين.
//
// order_id/branch_id اتحولوا لـlegacy_order_id/branch_id عادي (زي فلسفة legacy_user_id بالظبط -
// راجع 001_create_identity_access_tables) لأن Orders & Branches contexts لسه ما اتبنوش. created_by/
// resolved_by/called_by/assigned_to دول فعلاً foreign key حقيقي على users(id) بقى ممكن لأن
// Identity & Access موجود فعلاً - تحسين حقيقي عن الريبو القديم اللي معندوش FK هناك أصلًا.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("customer_followups")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("legacy_order_id", "integer")
    .addColumn("branch_id", "uuid")
    .addColumn("customer_phone", "text", (col) => col.notNull())
    .addColumn("call_result", "text", (col) =>
      col.notNull().check(sql`call_result IN ('answered','no_answer','no_answer_after_3_tries')`)
    )
    .addColumn("satisfaction_rating", "text", (col) =>
      col.check(sql`satisfaction_rating IN ('excellent','good','average','bad')`)
    )
    .addColumn("notes", "text")
    .addColumn("has_complaint", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("called_by", "uuid", (col) => col.references("users.id"))
    .addColumn("called_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_followup_id", "integer")
    .execute();
  await db.schema
    .createIndex("idx_customer_followups_phone")
    .on("customer_followups")
    .column("customer_phone")
    .execute();

  await db.schema
    .createTable("complaints")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("channel", "text", (col) => col.notNull().check(sql`channel IN ('phone_followup','whatsapp')`))
    .addColumn("legacy_order_id", "integer")
    .addColumn("branch_id", "uuid")
    .addColumn("followup_id", "uuid", (col) => col.references("customer_followups.id"))
    .addColumn("customer_phone", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) =>
      col.notNull().check(sql`category IN ('late_order','wrong_item','quality','other')`)
    )
    .addColumn("description", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("open").check(sql`status IN ('open','in_progress','resolved')`)
    )
    .addColumn("resolution_notes", "text")
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("assigned_to", "uuid", (col) => col.references("users.id"))
    .addColumn("resolved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("resolved_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_complaint_id", "integer")
    .addColumn("legacy_source", "text", (col) => col.check(sql`legacy_source IN ('customer_complaints','whatsapp_complaints')`))
    .execute();
  await db.schema.createIndex("idx_complaints_phone").on("complaints").column("customer_phone").execute();
  await db.schema
    .createIndex("idx_complaints_open")
    .on("complaints")
    .column("status")
    .where(sql.ref("status"), "!=", "resolved")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("complaints").execute();
  await db.schema.dropTable("customer_followups").execute();
}
