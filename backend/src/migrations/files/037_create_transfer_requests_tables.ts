import { Kysely, sql } from "kysely";

// TransferRequest - نفس مفهوم kitchen_orders في الريبو القديم بس معمّم لأي فرع لأي فرع (مش السنتر كيتشن
// بس تحديدًا) - طلب فرع لأصناف من فرع تاني. حالة الطلب (SUBMITTED -> APPROVED -> DISPATCHED -> RECEIVED،
// أو REJECTED/CANCELLED) منفصلة عن أثره الحقيقي على المخزون - الأثر (TRANSFER_OUT عند fromBranchId وقت
// dispatch، TRANSFER_IN عند toBranchId وقت receive) بيتسجّل في stock_movements الموجود بالفعل، مفيش
// جدول رصيد جديد. راجع تعليق transfer-request.aggregate.ts للتفاصيل الكاملة
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("transfer_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("from_branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("to_branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("requested_by", "uuid", (col) => col.references("users.id"))
    .addColumn("required_date", "date")
    .addColumn("notes", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("SUBMITTED").check(sql`status IN ('SUBMITTED','APPROVED','REJECTED','DISPATCHED','RECEIVED','CANCELLED')`)
    )
    .addColumn("approved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("rejected_by", "uuid", (col) => col.references("users.id"))
    .addColumn("rejection_reason", "text")
    .addColumn("dispatched_by", "uuid", (col) => col.references("users.id"))
    .addColumn("dispatched_at", "timestamptz")
    .addColumn("received_by", "uuid", (col) => col.references("users.id"))
    .addColumn("received_at", "timestamptz")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("transfer_request_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("transfer_request_id", "uuid", (col) => col.notNull().references("transfer_requests.id").onDelete("cascade"))
    .addColumn("inventory_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("requested_quantity", "numeric", (col) => col.notNull())
    .addColumn("approved_quantity", "numeric")
    .addColumn("dispatched_quantity", "numeric")
    .addColumn("received_quantity", "numeric")
    .addColumn("dispatch_movement_id", "uuid", (col) => col.references("stock_movements.id"))
    .addColumn("receive_movement_id", "uuid", (col) => col.references("stock_movements.id"))
    .execute();

  await db.schema.createIndex("idx_transfer_request_lines_request").on("transfer_request_lines").column("transfer_request_id").execute();
  await db.schema.createIndex("idx_transfer_requests_from_branch").on("transfer_requests").column("from_branch_id").execute();
  await db.schema.createIndex("idx_transfer_requests_to_branch").on("transfer_requests").column("to_branch_id").execute();
  await db.schema.createIndex("idx_transfer_requests_required_date").on("transfer_requests").column("required_date").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("transfer_request_lines").execute();
  await db.schema.dropTable("transfer_requests").execute();
}
