import { Kysely, sql } from "kysely";

// ConversionOrder - يوحّد production_orders + packaging_orders من الريبو القديم (كانا نفس شكل دورة
// الحياة بالظبط - راجع تعليقات conversion-order.aggregate.ts للتفاصيل الكاملة). مفيش
// production_order_batches هنا (لا batch/FEFO tracking في neo أصلًا - نفس تبسيط باقي Inventory)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("conversion_orders")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("recipe_id", "uuid", (col) => col.notNull().references("recipes.id"))
    .addColumn("recipe_version_id", "uuid", (col) => col.notNull().references("recipe_versions.id"))
    .addColumn("output_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED')`)
    )
    .addColumn("planned_output_quantity", "numeric", (col) => col.notNull())
    .addColumn("actual_output_quantity", "numeric")
    .addColumn("output_unit_cost", "numeric")
    .addColumn("output_movement_id", "uuid", (col) => col.references("stock_movements.id"))
    .addColumn("variance_reason", "text")
    .addColumn("notes", "text")
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("completed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("conversion_order_input_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("conversion_order_id", "uuid", (col) => col.notNull().references("conversion_orders.id").onDelete("cascade"))
    .addColumn("ingredient_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("planned_quantity_per_unit", "numeric", (col) => col.notNull())
    .addColumn("planned_quantity", "numeric", (col) => col.notNull())
    .addColumn("actual_quantity", "numeric")
    .addColumn("unit_cost", "numeric")
    .addColumn("movement_id", "uuid", (col) => col.references("stock_movements.id"))
    .execute();

  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE',
      'RETURN_TO_SUPPLIER','STOCK_COUNT','PRODUCTION_OUT','PRODUCTION_IN','PRODUCTION_REVERSAL'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE',
      'RETURN_TO_SUPPLIER','STOCK_COUNT'))`.execute(db);
  await db.schema.dropTable("conversion_order_input_lines").execute();
  await db.schema.dropTable("conversion_orders").execute();
}
