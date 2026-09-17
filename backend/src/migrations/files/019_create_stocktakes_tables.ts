import { Kysely, sql } from "kysely";

// Stocktake: جرد فعلي (Spot Check) - جلسة واحدة (header) بتشمل سطر لكل خامة اتعدّت فعليًا؛ الخامات
// اللي الفرق فيها صفر (الرصيد مطابق) مش بتتسجل كسطر خالص، عشان السجل يفضل يوريك الفروق الحقيقية بس -
// نفس فلسفة الريبو القديم بالظبط. تحميل العجز على موظف بعينه (سلفة) مؤجّل هنا - نفس تأجيل عجز شيفت
// الكاشير بالظبط (راجع تعليق migration 013)؛ كل فرق (عجز أو زيادة) بيترحّل لحساب محاسبي عادي بس
// (افتراضيًا 5300 "تكلفة بضاعة مباعة أخرى" - نفس كود الريبو القديم الافتراضي بالظبط). مفيش تصحيحات
// (stocktake_line_corrections) في السلايس ده - تبسيط متعمّد، أي غلط في سطر محتاج جلسة جرد جديدة
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("stocktakes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("notes", "text")
    .addColumn("total_variance_value", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("stocktake_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("stocktake_id", "uuid", (col) => col.notNull().references("stocktakes.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("system_quantity", "numeric", (col) => col.notNull())
    .addColumn("actual_quantity", "numeric", (col) => col.notNull())
    .addColumn("variance_quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_cost", "numeric")
    .addColumn("variance_value", "numeric")
    .addColumn("reason", "text")
    .addColumn("charge_account_code", "text")
    .addColumn("inventory_movement_id", "uuid", (col) => col.references("stock_movements.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_stocktake_lines_stocktake").on("stocktake_lines").column("stocktake_id").execute();

  // STOCK_COUNT محتاجة تتضاف لقيد CHECK بتاع stock_movements.movement_type (نفس نمط RETURN_TO_SUPPLIER
  // في migration 017 بالظبط)
  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE','RETURN_TO_SUPPLIER','STOCK_COUNT'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check`.execute(db);
  await sql`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('RECEIPT','CONSUMPTION','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','OPENING_BALANCE','RETURN_TO_SUPPLIER'))`.execute(db);
  await db.schema.dropTable("stocktake_lines").execute();
  await db.schema.dropTable("stocktakes").execute();
}
