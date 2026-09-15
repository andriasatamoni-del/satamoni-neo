import { Kysely, sql } from "kysely";

// Delivery & Dispatch context - Driver + DeliveryAssignment. delivery_assignments.order_id UNIQUE:
// طلب واحد بس ينفعله assignment واحد (لو محتاج يتحوّل لسائق تاني بعد فشل، ده تعامل مؤجّل لسلايس تاني -
// راجع تعليق delivery-assignment.aggregate.ts). مؤجّل: driver_settlements، driver_shifts.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("drivers")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("phone", "text")
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("AVAILABLE").check(sql`status IN ('AVAILABLE','BUSY','OFF_DUTY','SUSPENDED','INACTIVE')`))
    .addColumn("legacy_driver_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("delivery_assignments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("order_id", "uuid", (col) => col.notNull().references("orders.id").unique())
    .addColumn("driver_id", "uuid", (col) => col.notNull().references("drivers.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("ASSIGNED").check(sql`status IN ('UNASSIGNED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED')`)
    )
    .addColumn("assigned_by", "uuid", (col) => col.references("users.id"))
    .addColumn("assigned_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("delivered_at", "timestamptz")
    .addColumn("failure_reason", "text")
    .execute();
  await db.schema.createIndex("idx_delivery_assignments_driver").on("delivery_assignments").column("driver_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("delivery_assignments").execute();
  await db.schema.dropTable("drivers").execute();
}
