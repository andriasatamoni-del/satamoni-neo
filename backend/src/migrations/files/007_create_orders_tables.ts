import { Kysely, sql } from "kysely";

// Orders & POS context - سلايس أول مبسّط عمدًا (راجع تعليق order.aggregate.ts): مفيش نقاط ولاء، ضريبة
// مجمّدة، void workflow، تفاصيل توصيل (Delivery & Dispatch context تاني)، شيفتات كاشير، أو
// order_status_log - كل دول هيتضافوا في سلايس لاحق لما فعلًا يبقى ليهم مستهلك حقيقي.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("orders")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("order_type", "text", (col) => col.notNull().check(sql`order_type IN ('dinein','takeaway','delivery')`))
    .addColumn("table_number", "text")
    .addColumn("customer_name", "text")
    .addColumn("customer_phone", "text")
    .addColumn("address_details", "text")
    .addColumn("subtotal", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("discount", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("total", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("preparing").check(sql`status IN ('preparing','out_for_delivery','completed','cancelled')`))
    .addColumn("kitchen_status", "text", (col) => col.notNull().defaultTo("NEW").check(sql`kitchen_status IN ('NEW','ACCEPTED','PREPARING','READY')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_order_id", "integer")
    .execute();
  await db.schema.createIndex("idx_orders_branch_created_at").on("orders").columns(["branch_id", "created_at"]).execute();

  await db.schema
    .createTable("order_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("order_id", "uuid", (col) => col.notNull().references("orders.id").onDelete("cascade"))
    .addColumn("menu_item_id", "uuid", (col) => col.notNull().references("menu_items.id"))
    .addColumn("variant_id", "uuid", (col) => col.notNull().references("menu_item_variants.id"))
    .addColumn("quantity", "integer", (col) => col.notNull().check(sql`quantity > 0 AND quantity <= 10000`))
    .addColumn("unit_price", "numeric", (col) => col.notNull())
    .addColumn("line_total", "numeric", (col) => col.notNull())
    .execute();
  await db.schema.createIndex("idx_order_items_order").on("order_items").column("order_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("order_items").execute();
  await db.schema.dropTable("orders").execute();
}
