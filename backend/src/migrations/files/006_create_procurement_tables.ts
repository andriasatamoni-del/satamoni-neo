import { Kysely, sql } from "kysely";

// Procurement context - Supplier + PurchaseOrder + GoodsReceipt. goods_receipts.purchase_order_id
// nullable عمدًا: بيوحّد مسار الاستلام الرسمي (مربوط بأمر شراء) مع المشترى النقدي السريع/الطارئ
// (PO-less) في نفس الجدول - نفس الدمج اللي خطة إعادة البناء طلبته (راجع تعليق goods-receipt.aggregate.ts).
// مؤجّل: purchase_requests (طلبات الشراء قبل الأمر)، purchase_returns، supplier_invoices/payments/
// ledger، مقارنة أسعار الموردين - كل دول موجودين في الريبو القديم كمرجع.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("suppliers")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("contact_person", "text")
    .addColumn("phone", "text")
    .addColumn("email", "text")
    .addColumn("address", "text")
    .addColumn("payment_terms", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("ACTIVE").check(sql`status IN ('ACTIVE','INACTIVE','BLOCKED')`))
    .addColumn("legacy_supplier_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("purchase_orders")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("supplier_id", "uuid", (col) => col.notNull().references("suppliers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','SENT','RECEIVED','CANCELLED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_purchase_order_id", "integer")
    .execute();

  await db.schema
    .createTable("purchase_order_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("purchase_order_id", "uuid", (col) => col.notNull().references("purchase_orders.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_price", "numeric", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("goods_receipts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("purchase_order_id", "uuid", (col) => col.references("purchase_orders.id"))
    .addColumn("supplier_id", "uuid", (col) => col.references("suppliers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','CONFIRMED')`))
    .addColumn("received_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("confirmed_at", "timestamptz")
    .addColumn("legacy_goods_receipt_id", "integer")
    .execute();

  await db.schema
    .createTable("goods_receipt_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("goods_receipt_id", "uuid", (col) => col.notNull().references("goods_receipts.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_cost", "numeric", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("goods_receipt_items").execute();
  await db.schema.dropTable("goods_receipts").execute();
  await db.schema.dropTable("purchase_order_items").execute();
  await db.schema.dropTable("purchase_orders").execute();
  await db.schema.dropTable("suppliers").execute();
}
