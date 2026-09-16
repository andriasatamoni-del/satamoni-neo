import { Kysely, sql } from "kysely";

// أول alterTable في المشروع - orders (migration 007) اتنشرت فعليًا قبل ما Payment Control يتبنى، عكس
// حالات زي branchId في PurchaseOrder اللي اتصلّحت في نفس migration قبل ما تتنشر. عمود nullable عمدًا:
// طلب اتسجّل من غير طريقة دفع محددة (نادر) مالوش Payment خالص - نفس القيد الموروث من الريبو القديم
// (docs/PAYMENT-CONTROL.md بند 4).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("orders")
    .addColumn("payment_method_id", "uuid", (col) => col.references("payment_methods.id"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("orders").dropColumn("payment_method_id").execute();
}
