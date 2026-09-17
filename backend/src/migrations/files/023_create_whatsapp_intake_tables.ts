import { Kysely, sql } from "kysely";

// بوابة استقبال واتساب (reviewable-intake) - نسخة مبسّطة عمدًا من bot الذكاء الاصطناعي الكامل في
// الريبو القديم (routes/whatsapp.js + services/whatsapp-bot/*): من غير ربط حقيقي بـMeta Cloud API
// (محتاج بيانات اعتماد حقيقية - WHATSAPP_ACCESS_TOKEN/WHATSAPP_APP_SECRET) ومن غير حلقة رد آلي بذكاء
// اصطناعي (محتاجة ANTHROPIC_API_KEY) - الاتنين مؤجّلين لحد ما بيانات الاعتماد الحقيقية تتوفر. اللي
// موجود هنا: استقبال/تسجيل الرسائل الواردة (webhook)، ومراجعة بشرية تحوّل محادثة لطلب حقيقي (بيستخدم
// نفس RegisterOrderHandler اللي POST /orders بيستخدمه بالظبط - مفيش منطق مخزون/محاسبة مكرر) أو لشكوى
// حقيقية في CRM (channel='whatsapp' - نفس Complaint aggregate الموحّد، مفيش whatsapp_complaints منفصل)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("whatsapp_conversations")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("phone", "text", (col) => col.notNull().unique())
    .addColumn("customer_name", "text")
    .addColumn("last_message_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("whatsapp_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("conversation_id", "uuid", (col) => col.notNull().references("whatsapp_conversations.id").onDelete("cascade"))
    .addColumn("direction", "text", (col) => col.notNull().check(sql`direction IN ('in','out')`))
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("wa_message_id", "text")
    .addColumn("sent_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`CREATE INDEX idx_whatsapp_messages_conversation ON whatsapp_messages (conversation_id, created_at)`.execute(db);

  await db.schema
    .createTable("whatsapp_pending_orders")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("conversation_id", "uuid", (col) => col.notNull().references("whatsapp_conversations.id").onDelete("cascade"))
    .addColumn("customer_phone", "text", (col) => col.notNull())
    .addColumn("customer_name", "text")
    .addColumn("order_type", "text", (col) => col.notNull().check(sql`order_type IN ('dinein','takeaway','delivery')`))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("address_details", "text")
    .addColumn("total", "numeric", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("PENDING").check(sql`status IN ('PENDING','CONFIRMED','REJECTED')`))
    .addColumn("rejection_reason", "text")
    .addColumn("reviewed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("confirmed_order_id", "uuid", (col) => col.references("orders.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("whatsapp_pending_order_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("pending_order_id", "uuid", (col) => col.notNull().references("whatsapp_pending_orders.id").onDelete("cascade"))
    .addColumn("variant_id", "uuid", (col) => col.notNull().references("menu_item_variants.id"))
    .addColumn("item_name", "text", (col) => col.notNull())
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_price", "numeric", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("whatsapp_pending_order_lines").execute();
  await db.schema.dropTable("whatsapp_pending_orders").execute();
  await db.schema.dropTable("whatsapp_messages").execute();
  await db.schema.dropTable("whatsapp_conversations").execute();
}
