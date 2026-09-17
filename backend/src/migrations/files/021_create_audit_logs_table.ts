import { Kysely, sql } from "kysely";

// audit_logs - سجل تدقيق عام عابر لكل الـcontexts (نفس مفهوم audit_logs في الريبو القديم)، بيتسجّل
// تلقائيًا لكل طلب HTTP بينجح وبيغيّر حالة (POST/PATCH/PUT/DELETE) عن طريق AuditLogInterceptor العام
// (src/shared/audit) - مفيش حاجة لازم تستدعيه يدوي من كل handler. مختلف عن event_outbox (اللي بيسجّل
// أحداث الدومين المنشورة صراحة بين الـcontexts فقط) - ده بيسجّل "مين عمل إيه" على مستوى الـAPI بغض
// النظر عن نشر حدث دومين من عدمه. approval_grants (توكن PIN اللحظي للموافقة على إجراءات حساسة) في
// الريبو القديم متأجّل بالكامل عمدًا - نفس القرار الموثّق في تعليق migration
// 010_create_payment_control_tables.ts، لسه مش مبني في neo أصلًا. approval_requests (طابور موافقة غير
// متزامن عام) مش محتاجينه برضه - كل context عنده الآن state machine خاص بيه أغنى وأكثر أمان للأنواع
// (PayrollRun.approve, LeaveRequest.approve/reject, PurchaseRequest.approve/reject,
// DriverSettlement.reviewVariance, SupplierInvoice.approve...) وده أفضل تصميميًا من طابور عام واحد
// ضعيف الأنواع - سجل التدقيق ده بيغطي تتبعهم كلهم تلقائيًا لأنهم كلهم POST/PATCH عادي.
// ON DELETE SET NULL على actor_user_id/branch_id عمدًا: سجل التدقيق تاريخي وثابت، حذف مستخدم أو فرع
// لاحقًا (أو تنظيف بيانات اختبار) ميلغيش الأحداث اللي حصلت فعلًا - بس المرجع بيبقى NULL بدل ما يمنع
// الحذف بـRESTRICT الافتراضي
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("audit_logs")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("actor_user_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("entity_type", "text")
    .addColumn("entity_id", "text")
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id").onDelete("set null"))
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id)`.execute(db);
  await sql`CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_user_id)`.execute(db);
  await sql`CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("audit_logs").execute();
}
