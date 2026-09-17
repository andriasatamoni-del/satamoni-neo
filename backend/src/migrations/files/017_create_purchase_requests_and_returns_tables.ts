import { Kysely, sql } from "kysely";

// PurchaseRequest: أول خطوة في السلسلة الرسمية - طلب داخلي "عايز أشتري كذا" قبل أي التزام مع مورد/سعر،
// نفس مفهوم purchase_requests في الريبو القديم بالظبط (اعتماد على مستوى الطلب كله، مش بند بند). الربط
// مع PurchaseOrder موثّق هنا في اتجاه واحد بس (converted_to_purchase_order_id على الطلب) بدل عمود
// purchase_request_id على purchase_orders زي الريبو القديم - تبسيط متعمّد، مفيش حاجة محتاجة اتجاه عكسي
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("purchase_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("requested_by", "uuid", (col) => col.references("users.id"))
    .addColumn("required_date", "date")
    .addColumn("reason", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED_TO_PO','CANCELLED')`)
    )
    .addColumn("approved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("rejected_by", "uuid", (col) => col.references("users.id"))
    .addColumn("rejection_reason", "text")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("converted_to_purchase_order_id", "uuid", (col) => col.references("purchase_orders.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("purchase_request_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("purchase_request_id", "uuid", (col) => col.notNull().references("purchase_requests.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("requested_quantity", "numeric", (col) => col.notNull())
    .addColumn("unit", "text")
    .addColumn("notes", "text")
    .execute();

  // PurchaseReturn: رجوع بضاعة اتستلمت فعلًا للمورد (تالفة/غلط/منتهية) - مستقل تمامًا عن تعديل GRN/PO
  // الأصلي (goods_receipt_id هنا للتتبع بس، مش قفل/تعديل)، بيرحّل حركة مخزون عكسية + قيد محاسبي عكسي
  // لقيد الاستلام الأصلي. مفيش تتبع دفعات (batch) هنا - Inventory context في المشروع ده أصلًا مالوش
  // مفهوم batch/FEFO زي الريبو القديم، فتكلفة كل بند بتتحدد من inventory_items.unit_cost وقت التسجيل
  // (أو قيمة صريحة) - تبسيط متعمّد موثّق، راجع PurchaseReturn aggregate
  await db.schema
    .createTable("purchase_returns")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("supplier_id", "uuid", (col) => col.references("suppliers.id"))
    .addColumn("goods_receipt_id", "uuid", (col) => col.references("goods_receipts.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','POSTED','CANCELLED')`))
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("total_value", "numeric")
    .addColumn("journal_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("posted_by", "uuid", (col) => col.references("users.id"))
    .addColumn("posted_at", "timestamptz")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("purchase_return_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("purchase_return_id", "uuid", (col) => col.notNull().references("purchase_returns.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull().check(sql`quantity > 0`))
    .addColumn("unit", "text", (col) => col.notNull())
    .addColumn("unit_cost", "numeric")
    .addColumn("line_value", "numeric")
    .execute();

  // RETURN_TO_SUPPLIER محتاجة تتضاف لقيد CHECK بتاع stock_movements.movement_type (نفس القيمة
  // المستخدمة في الريبو القديم لنفس الغرض بالظبط)
  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE','RETURN_TO_SUPPLIER'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE'))`.execute(db);
  await db.schema.dropTable("purchase_return_items").execute();
  await db.schema.dropTable("purchase_returns").execute();
  await db.schema.dropTable("purchase_request_items").execute();
  await db.schema.dropTable("purchase_requests").execute();
}
