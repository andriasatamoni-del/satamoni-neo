import { Kysely } from "kysely";

// customer_followups كان بيربط بس بـlegacy_order_id (راجع تعليق migration 002) لأن Orders context لسه
// ما كانش اتبنى وقتها. اتبنى بعدين (NEOORD) - العمود ده بيضيف ربط حقيقي (FK) لطلبات satamoni-neo نفسها
// عشان طابور المتابعة (followup-queue) يقدر يشتغل على أوردرات حقيقية اتسلّمت فعليًا، مش بس المستوردة
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("customer_followups").addColumn("order_id", "uuid", (col) => col.references("orders.id")).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("customer_followups").dropColumn("order_id").execute();
}
