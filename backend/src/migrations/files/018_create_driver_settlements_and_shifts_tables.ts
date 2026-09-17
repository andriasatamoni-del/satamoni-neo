import { Kysely, sql } from "kysely";

// DriverSettlement: تسوية كاش السائق - مش "شيفت" وليها open/close، دفعة واحدة بتتحسب حيّة وقت
// التسجيل من delivery_assignments المُوصّلة اللي لسه مربوطة بتسوية (settlement_id IS NULL)، بالظبط زي
// فلسفة الريبو القديم (driver_settlements) وCashierShift في المشروع ده. DriverAttendanceShift مفهوم
// مختلف تمامًا ومستقل - حضور/أجر بالساعة، مش علاقة له بكاش التوصيل - راجع تعليقات الأجريجيتس نفسها
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("delivery_assignments")
    .addColumn("collected_amount", "numeric")
    .execute();

  await db.schema
    .createTable("driver_settlements")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("driver_id", "uuid", (col) => col.notNull().references("drivers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("settled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("settled_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("order_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("cod_expected", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("cod_collected", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("expected_handover", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("actual_handover", "numeric", (col) => col.notNull())
    .addColumn("handover_variance", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("variance_status", "text", (col) =>
      col.notNull().defaultTo("NONE").check(sql`variance_status IN ('NONE','PENDING_REVIEW','ACKNOWLEDGED','APPROVED')`)
    )
    .addColumn("variance_reviewed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("variance_reviewed_at", "timestamptz")
    .addColumn("variance_review_notes", "text")
    .addColumn("bonus_total", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("delivery_assignments")
    .addColumn("settlement_id", "uuid", (col) => col.references("driver_settlements.id"))
    .execute();

  await db.schema
    .createTable("driver_attendance_shifts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("driver_id", "uuid", (col) => col.notNull().references("drivers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("ACTIVE").check(sql`status IN ('ACTIVE','CLOSED')`))
    .addColumn("checked_in_by", "uuid", (col) => col.references("users.id"))
    .addColumn("checked_in_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("checked_out_by", "uuid", (col) => col.references("users.id"))
    .addColumn("checked_out_at", "timestamptz")
    .addColumn("hourly_rate", "numeric", (col) => col.notNull())
    .addColumn("hours_worked", "numeric")
    .addColumn("wage_amount", "numeric")
    .addColumn("bonus_total", "numeric")
    .addColumn("total_pay", "numeric")
    .addColumn("journal_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // شيفت واحد ACTIVE بس لكل سائق - نفس نمط idx_cashier_shifts_one_active_per_user (migration 013)
  await sql`CREATE UNIQUE INDEX idx_driver_attendance_shifts_one_active_per_driver
    ON driver_attendance_shifts (driver_id) WHERE status = 'ACTIVE'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("driver_attendance_shifts").execute();
  await db.schema.alterTable("delivery_assignments").dropColumn("settlement_id").execute();
  await db.schema.dropTable("driver_settlements").execute();
  await db.schema.alterTable("delivery_assignments").dropColumn("collected_amount").execute();
}
