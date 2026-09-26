import { Kysely, sql } from "kysely";

// HomeTile - نفس مفهوم home_tiles بالريبو القديم بالظبط: بطاقات اختصار للتنقل على الصفحة الرئيسية
// (مش KPI/مقاييس حية - كل بطاقة بس عنوان/وصف/رابط لصفحة تانية، راجع تعليق HomePage.tsx). جدول واحد
// عام (مش لكل مستخدم/دور - نفس القرار الموروث بالحرف، الشاشة المقصودة هي اللي بتتحقق من الصلاحية).
// tile_key/href/icon ثابتين (مرتبطين بالصفحة الفعلية) - العنوان/الوصف/الترتيب بس قابلين للتعديل من
// الأدمن وقت التشغيل (نفس تقييد routes/home-tiles.js بالريبو القديم بالحرف).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("home_tiles")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("tile_key", "text", (col) => col.notNull().unique())
    .addColumn("href", "text", (col) => col.notNull())
    .addColumn("icon", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("display_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // نفس مجموعة البطاقات اللي كانت مكتوبة ثابتة في HomePage.tsx بالحرف - بس دلوقتي DB-backed وقابلة
  // للتعديل (عنوان/وصف/ترتيب) من الأدمن من غير أي تغيير في الكود
  const seed = [
    { tile_key: "orders", href: "/orders", icon: "cart", title: "الطلبات (POS)", description: "تسجيل وتتبّع طلبات البيع", display_order: 10 },
    { tile_key: "crm", href: "/crm", icon: "users", title: "متابعة العملاء والشكاوى", description: "المتابعات والشكاوى", display_order: 20 },
    { tile_key: "branches", href: "/branches", icon: "building", title: "الفروع", description: "إدارة فروع المطعم", display_order: 30 },
    { tile_key: "inventory", href: "/inventory", icon: "box", title: "المخزون", description: "الأصناف والأرصدة", display_order: 40 },
    { tile_key: "catalog", href: "/catalog", icon: "book", title: "قائمة الطعام", description: "الأقسام والأصناف", display_order: 50 },
    { tile_key: "procurement", href: "/procurement", icon: "clipboard", title: "المشتريات والموردين", description: "أوامر الشراء والاستلام", display_order: 60 },
    { tile_key: "delivery", href: "/delivery", icon: "truck", title: "التوصيل والسائقين", description: "تعيينات التوصيل", display_order: 70 },
    { tile_key: "accounting", href: "/accounting", icon: "coins", title: "المحاسبة", description: "الحسابات والقيود", display_order: 80 },
    { tile_key: "payment-control", href: "/payment-control", icon: "card", title: "التحكم في المدفوعات والمطابقة", description: "الدفعات والمطابقة", display_order: 90 },
    { tile_key: "hr-payroll", href: "/hr-payroll", icon: "id-card", title: "الموارد البشرية والرواتب", description: "الموظفين وقوائم الرواتب", display_order: 100 },
  ];
  for (const row of seed) {
    await db.insertInto("home_tiles" as never).values(row as never).execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("home_tiles").execute();
}
