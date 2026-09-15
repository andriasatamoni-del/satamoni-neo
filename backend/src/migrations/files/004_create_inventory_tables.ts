import { Kysely, sql } from "kysely";

// Inventory context - InventoryItem (كتالوج الأصناف) + StockMovement (ليدجر المصدر الوحيد للحقيقة) +
// branch_stock_balances (إسقاط/projection للرصيد الحالي، بيتحدّث ذريًا مع كل حركة - راجع تعليق
// stock-movement.aggregate.ts). على عكس Identity/CRM/Branches، هنا branch_id FK حقيقي على branches(id)
// من الأول لأن Branches context موجود بالفعل.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("inventory_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("unit", "text", (col) => col.notNull())
    .addColumn("unit_cost", "numeric")
    .addColumn("item_type", "text", (col) => col.notNull().defaultTo("raw").check(sql`item_type IN ('raw','manufactured')`))
    .addColumn("negative_stock_policy", "text", (col) =>
      col.notNull().defaultTo("STRICT").check(sql`negative_stock_policy IN ('STRICT','ALLOW_WITH_APPROVAL')`)
    )
    .addColumn("legacy_inventory_item_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("stock_movements")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("movement_type", "text", (col) =>
      col.notNull().check(sql`movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE')`)
    )
    .addColumn("quantity_delta", "numeric", (col) => col.notNull().check(sql`quantity_delta <> 0`))
    .addColumn("reason", "text")
    .addColumn("reference_type", "text")
    .addColumn("reference_id", "text")
    .addColumn("performed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("occurred_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_reference_key", "text", (col) => col.unique())
    .execute();
  await db.schema
    .createIndex("idx_stock_movements_item_branch")
    .on("stock_movements")
    .columns(["inventory_item_id", "branch_id"])
    .execute();

  await db.schema
    .createTable("branch_stock_balances")
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("branch_stock_balances_pk", ["branch_id", "inventory_item_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("branch_stock_balances").execute();
  await db.schema.dropTable("stock_movements").execute();
  await db.schema.dropTable("inventory_items").execute();
}
