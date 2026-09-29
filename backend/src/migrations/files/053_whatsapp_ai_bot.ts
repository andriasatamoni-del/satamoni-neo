import { Kysely, sql } from "kysely";

// AI-1: بوت خدمة العملاء (نفس services/whatsapp-bot في الريبو القديم):
// - whatsapp_conversations.channel: نفس المحادثة ممكن تيجي من واتساب/ماسنجر/إنستجرام (نفس تطبيق Meta)،
//   ورقم/معرّف العميل unique لكل قناة مش على مستوى الجدول كله.
// - whatsapp_pending_orders: حالة DRAFT - البوت بيجمّع الأوردر تدريجيًا من المحادثة قبل ما العميل يأكد،
//   والفرع ممكن يبقى لسه مش معروف في المسودة (بس لازم يتحدد قبل ما تبقى PENDING).
// - whatsapp_pending_order_lines.modifier_ids: إضافات الصنف اللي العميل طلبها (نفس modifierIds بتاعة
//   POST /orders) عشان التأكيد يسجّل نفس الأوردر بالظبط بسعره الصحيح.
// - pos_settings.whatsapp_bot_enabled: مفتاح تشغيل/إيقاف البوت من الواجهة (مقفول افتراضيًا).
// - complaints.channel: قنوات ماسنجر وإنستجرام كمان.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE whatsapp_conversations ADD COLUMN channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','messenger','instagram'))`.execute(db);
  await sql`ALTER TABLE whatsapp_conversations DROP CONSTRAINT whatsapp_conversations_phone_key`.execute(db);
  await sql`ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_channel_phone_key UNIQUE (channel, phone)`.execute(db);

  await sql`ALTER TABLE whatsapp_pending_orders DROP CONSTRAINT whatsapp_pending_orders_status_check`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ADD CONSTRAINT whatsapp_pending_orders_status_check
    CHECK (status IN ('DRAFT','PENDING','CONFIRMED','REJECTED'))`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ALTER COLUMN branch_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ADD CONSTRAINT whatsapp_pending_orders_branch_required
    CHECK (status = 'DRAFT' OR branch_id IS NOT NULL)`.execute(db);
  await sql`CREATE UNIQUE INDEX whatsapp_pending_orders_one_draft_per_conversation
    ON whatsapp_pending_orders (conversation_id) WHERE status = 'DRAFT'`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(db);

  await sql`ALTER TABLE whatsapp_pending_order_lines ADD COLUMN modifier_ids jsonb NOT NULL DEFAULT '[]'::jsonb`.execute(db);

  await sql`ALTER TABLE pos_settings ADD COLUMN whatsapp_bot_enabled boolean NOT NULL DEFAULT false`.execute(db);

  await sql`ALTER TABLE complaints DROP CONSTRAINT complaints_channel_check`.execute(db);
  await sql`ALTER TABLE complaints ADD CONSTRAINT complaints_channel_check
    CHECK (channel IN ('phone_followup','whatsapp','messenger','instagram'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE complaints DROP CONSTRAINT complaints_channel_check`.execute(db);
  await sql`ALTER TABLE complaints ADD CONSTRAINT complaints_channel_check CHECK (channel IN ('phone_followup','whatsapp'))`.execute(db);
  await sql`ALTER TABLE pos_settings DROP COLUMN whatsapp_bot_enabled`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_order_lines DROP COLUMN modifier_ids`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders DROP COLUMN updated_at`.execute(db);
  await sql`DROP INDEX whatsapp_pending_orders_one_draft_per_conversation`.execute(db);
  await sql`DELETE FROM whatsapp_pending_order_lines WHERE pending_order_id IN (SELECT id FROM whatsapp_pending_orders WHERE status = 'DRAFT')`.execute(db);
  await sql`DELETE FROM whatsapp_pending_orders WHERE status = 'DRAFT'`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders DROP CONSTRAINT whatsapp_pending_orders_branch_required`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ALTER COLUMN branch_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders DROP CONSTRAINT whatsapp_pending_orders_status_check`.execute(db);
  await sql`ALTER TABLE whatsapp_pending_orders ADD CONSTRAINT whatsapp_pending_orders_status_check
    CHECK (status IN ('PENDING','CONFIRMED','REJECTED'))`.execute(db);
  await sql`ALTER TABLE whatsapp_conversations DROP CONSTRAINT whatsapp_conversations_channel_phone_key`.execute(db);
  await sql`ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_phone_key UNIQUE (phone)`.execute(db);
  await sql`ALTER TABLE whatsapp_conversations DROP COLUMN channel`.execute(db);
}
