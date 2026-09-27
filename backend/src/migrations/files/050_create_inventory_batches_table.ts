import { Kysely, sql } from "kysely";

// BATCH-1: تتبّع دفعات/لوط - نفس مفهوم inventory_batches بالريبو القديم، بس نطاق مبسّط عمدًا (راجع
// inventory-batch.aggregate.ts للتفاصيل). batch_number بيتولّد تلقائيًا من sequence واحد (نفس أسلوب
// journal_entry_number_seq في accounting) بدل نظام البادئة-لكل-صنف + تصفير يومي بتاع الريبو القديم
// (db/batch-numbering.js) - تبسيط متعمد، رقم فريد بسيط كفاية لغرض التتبّع.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE SEQUENCE inventory_batch_number_seq`.execute(db);

  await db.schema
    .createTable("inventory_batches")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("batch_number", "text", (col) => col.notNull().unique())
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("received_quantity", "numeric", (col) => col.notNull())
    .addColumn("remaining_quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_cost", "numeric")
    .addColumn("expiry_date", "date")
    .addColumn("production_date", "date")
    .addColumn("source_type", "text", (col) => col.notNull().check(sql`source_type IN ('purchase', 'production')`))
    .addColumn("source_id", "uuid", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active").check(sql`status IN ('active', 'depleted', 'expired')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_inventory_batches_item_branch_status")
    .on("inventory_batches")
    .columns(["inventory_item_id", "branch_id", "status"])
    .execute();
  await db.schema.createIndex("idx_inventory_batches_expiry").on("inventory_batches").column("expiry_date").execute();
  await db.schema.createIndex("idx_inventory_batches_source").on("inventory_batches").columns(["source_type", "source_id"]).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("inventory_batches").execute();
  await sql`DROP SEQUENCE inventory_batch_number_seq`.execute(db);
}
