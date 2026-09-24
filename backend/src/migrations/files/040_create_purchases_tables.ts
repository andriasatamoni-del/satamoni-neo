import { Kysely, sql } from "kysely";

// Purchase/PurchaseLine - نفس مفهوم purchases/purchase_items في الريبو القديم: مشترى نقدي طارئ
// (PO-less)، منفصل عمدًا عن مسار Procurement الرسمي - راجع تعليق purchase.aggregate.ts
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("purchases")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("business_date", "date", (col) => col.notNull())
    .addColumn("category", "text")
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("supplier_id", "uuid", (col) => col.references("suppliers.id"))
    .addColumn("supplier_document_number", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("PENDING").check(sql`status IN ('PENDING','CONFIRMED','REJECTED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("reviewed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("rejection_reason", "text")
    .addColumn("posted_to_inventory", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("purchase_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("purchase_id", "uuid", (col) => col.notNull().references("purchases.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("unit", "text")
    .addColumn("unit_price", "numeric", (col) => col.notNull())
    .addColumn("line_total", "numeric", (col) => col.notNull())
    .execute();

  await db.schema.createIndex("idx_purchase_lines_purchase").on("purchase_lines").column("purchase_id").execute();
  await db.schema.createIndex("idx_purchases_branch_date").on("purchases").columns(["branch_id", "business_date"]).execute();
  await db.schema.createIndex("idx_purchases_supplier_doc").on("purchases").columns(["supplier_id", "supplier_document_number"]).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("purchase_lines").execute();
  await db.schema.dropTable("purchases").execute();
}
