import { Kysely, sql } from "kysely";

// نظام الطباعة (TIER3-4) - نفس مفهوم الريبو القديم بالظبط (db/migrations/0015_printing.js): طابعات
// الفرع + محطات تحضير (المطبخ) + توجيه المنيو للمحطات (Menu Item/Category -> Station -> Printer) +
// طابور طباعة غير متزامن (print_jobs). فشل التوجيه (طابعة مقطوعة/محطة من غير طابعة) بيسجّل السطر FAILED
// فورًا بسبب واضح، من غير ما يوقف تسجيل الطلب نفسه أبدًا - نفس الفلسفة بالظبط.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("printers")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("printer_type", "text", (col) => col.notNull().check(sql`printer_type IN ('CASHIER','KITCHEN','DELIVERY','REPORT')`))
    .addColumn("connection_type", "text", (col) => col.notNull().defaultTo("USB").check(sql`connection_type IN ('USB','LAN')`))
    .addColumn("os_printer_name", "text")
    .addColumn("ip_address", "text")
    .addColumn("port", "integer")
    .addColumn("paper_width_mm", "integer", (col) => col.notNull().defaultTo(80))
    .addColumn("is_enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("is_default_for_type", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("kitchen_stations")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("printer_id", "uuid", (col) => col.references("printers.id").onDelete("set null"))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("uq_kitchen_stations_branch_name", ["branch_id", "name"])
    .execute();

  await sql`ALTER TABLE menu_categories ADD COLUMN station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL`.execute(db);
  await sql`ALTER TABLE menu_items ADD COLUMN station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL`.execute(db);

  await db.schema
    .createTable("print_jobs")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    // NULL مسموح بس لـTEST_PRINT (زرار "اختبار الطباعة" من شاشة إدارة الطابعات - مش مرتبط بطلب حقيقي)
    .addColumn("order_id", "uuid", (col) => col.references("orders.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn(
      "print_type",
      "text",
      (col) =>
        col.notNull().check(sql`print_type IN (
          'CUSTOMER_RECEIPT','KITCHEN_TICKET','KITCHEN_SUMMARY',
          'DELIVERY_SUMMARY','DELIVERY_FINAL_RECEIPT','DINE_IN_BILL','TEST_PRINT'
        )`)
    )
    .addColumn("printer_id", "uuid", (col) => col.references("printers.id").onDelete("set null"))
    .addColumn("station_id", "uuid", (col) => col.references("kitchen_stations.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("PENDING").check(sql`status IN ('PENDING','PRINTING','PRINTED','FAILED','CANCELLED')`))
    .addColumn("content_html", "text", (col) => col.notNull())
    .addColumn("idempotency_key", "text", (col) => col.notNull().unique())
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("printing_started_at", "timestamptz")
    .addColumn("printed_at", "timestamptz")
    .addColumn("failed_at", "timestamptz")
    .addCheckConstraint("chk_print_jobs_order_id", sql`order_id IS NOT NULL OR print_type = 'TEST_PRINT'`)
    .execute();

  await sql`CREATE INDEX idx_print_jobs_branch_status ON print_jobs (branch_id, status)`.execute(db);
  await sql`CREATE INDEX idx_print_jobs_order ON print_jobs (order_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("print_jobs").execute();
  await sql`ALTER TABLE menu_items DROP COLUMN station_id`.execute(db);
  await sql`ALTER TABLE menu_categories DROP COLUMN station_id`.execute(db);
  await db.schema.dropTable("kitchen_stations").execute();
  await db.schema.dropTable("printers").execute();
}
