import { Kysely, sql } from "kysely";

// فاتورة المورد وسدادها - طبقة مطابقة فوق دورة GRN (نفس فلسفة الريبو القديم بالظبط، راجع تعليق
// routes/supplier-invoices.js)، بس هنا بمطابقة على مستوى الاستلام كله (goods_receipt_id) مش سطر بسطر
// (goods_receipt_item_id) زي الريبو القديم - تبسيط متعمّد موثّق، راجع SupplierInvoice aggregate.
// السداد بيتخصص على خزينة محددة (treasury_id) بدل ما يستنتج حساب الكاش/البنك من نوع طريقة الدفع - أبسط
// وأوضح، ومتاح فقط لأن Treasury context اتبنى قبل كده (migration 015)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("supplier_invoices")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("supplier_id", "uuid", (col) => col.notNull().references("suppliers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("goods_receipt_id", "uuid", (col) => col.references("goods_receipts.id"))
    .addColumn("supplier_invoice_number", "text", (col) => col.notNull())
    .addColumn("invoice_date", "date", (col) => col.notNull().defaultTo(sql`current_date`))
    .addColumn("due_date", "date")
    .addColumn("subtotal", "numeric", (col) => col.notNull())
    .addColumn("tax", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("total", "numeric", (col) => col.notNull())
    .addColumn("matched_total", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("variance_amount", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status IN ('MATCHED','VARIANCE_PENDING','APPROVED','PARTIALLY_PAID','PAID','CANCELLED')`)
    )
    .addColumn("variance_journal_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("notes", "text")
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("supplier_invoices_supplier_id_number_key", ["supplier_id", "supplier_invoice_number"])
    .execute();

  await db.schema
    .createTable("supplier_invoice_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("supplier_invoice_id", "uuid", (col) => col.notNull().references("supplier_invoices.id"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("invoiced_quantity", "numeric", (col) => col.notNull())
    .addColumn("unit_price", "numeric", (col) => col.notNull())
    .addColumn("line_total", "numeric", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("supplier_payments")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("supplier_id", "uuid", (col) => col.notNull().references("suppliers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("supplier_invoice_id", "uuid", (col) => col.references("supplier_invoices.id"))
    .addColumn("treasury_id", "uuid", (col) => col.notNull().references("treasuries.id"))
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("payment_date", "date", (col) => col.notNull().defaultTo(sql`current_date`))
    .addColumn("reference_number", "text")
    .addColumn("notes", "text")
    .addColumn("journal_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("supplier_payments").execute();
  await db.schema.dropTable("supplier_invoice_lines").execute();
  await db.schema.dropTable("supplier_invoices").execute();
}
