import { Kysely, sql } from "kysely";

// حدود إعادة الطلب لكل (فرع، صنف) - نفس مفهوم reorder_point/min_stock/max_stock في الريبو القديم، بس
// في جدول منفصل بدل ما تتضاف كأعمدة على branch_stock_balances (الجدول ده read-model خالص بيتحدّث
// تلقائيًا مع كل حركة مخزون - راجع KyselyStockMovementRepository.recordMovement - وحدود إعادة الطلب
// حاجة تانية تمامًا: قيم بيضبطها مدير الفرع يدويًا ومش بتتغيّر مع كل حركة)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("branch_stock_thresholds")
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("reorder_point", "numeric")
    .addColumn("min_stock", "numeric")
    .addColumn("max_stock", "numeric")
    .addColumn("updated_by", "uuid", (col) => col.references("users.id"))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("branch_stock_thresholds_pkey", ["branch_id", "inventory_item_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("branch_stock_thresholds").execute();
}
