import { Kysely, sql } from "kysely";

// Department/Position - نفس فلسفة HRF-6 بالريبو القديم بالحرف: أقسام ومسميات وظيفية كـentities حقيقية
// بدل ما تكون free-text على employees.department/job_title مباشرة (كانت عرضة لتكرار/اختلاف كتابة زي
// "Kitchen"/"kitchen "). بما إن ده نظام جديد من غير بيانات قديمة نحافظ على توافقها، مفيش داعي لعمودين
// نصيين متزامنين زي الريبو القديم (كان مضطر ليهم عشان استهلاكين قدام - GROUP BY على النص القديم) -
// employees.department_id/position_id هما مصدر الحقيقة الوحيد هنا من الأول. status='inactive' = إخفاء
// من قوائم الاختيار الجديدة بس - مفيش DELETE أبدًا (موظفين حاليين بيشيروا لهم، وحذفهم يفقد سياق تاريخي)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("departments")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active").check(sql`status IN ('active','inactive')`))
    .addColumn("legacy_department_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("positions")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("department_id", "uuid", (col) => col.references("departments.id"))
    .addColumn("description", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active").check(sql`status IN ('active','inactive')`))
    .addColumn("legacy_position_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_positions_department").on("positions").column("department_id").execute();

  await db.schema
    .alterTable("employees")
    .addColumn("department_id", "uuid", (col) => col.references("departments.id"))
    .execute();
  await db.schema
    .alterTable("employees")
    .addColumn("position_id", "uuid", (col) => col.references("positions.id"))
    .execute();
  await db.schema.alterTable("employees").dropColumn("department").execute();
  await db.schema.alterTable("employees").dropColumn("job_title").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("employees").addColumn("job_title", "text").execute();
  await db.schema.alterTable("employees").addColumn("department", "text").execute();
  await db.schema.alterTable("employees").dropColumn("position_id").execute();
  await db.schema.alterTable("employees").dropColumn("department_id").execute();
  await db.schema.dropTable("positions").execute();
  await db.schema.dropTable("departments").execute();
}
