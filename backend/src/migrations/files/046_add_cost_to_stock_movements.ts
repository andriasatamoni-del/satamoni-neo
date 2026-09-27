import { Kysely } from "kysely";

// أساس محرك تكلفة الطعام (Food Cost Engine) - نفس مفهوم unit_cost/total_cost في inventory_movements
// بالريبو القديم بالظبط: تكلفة الوحدة "مجمّدة" وقت الحركة نفسها (مش سعر الصنف الحالي)، عشان لو
// unit_cost الصنف اتغيّر بعدين، تقارير التكلفة التاريخية تفضل صحيحة زي ما كانت وقت الحدث. NULLable
// لأن حركات قديمة (قبل هذه الهجرة) أو حركات لصنف من غير unit_cost معروف أصلًا هتفضل من غير تكلفة -
// التقرير بيتعامل مع الحالة دي صراحة (incomplete flag) بدل ما يخمّن.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("stock_movements")
    .addColumn("unit_cost", "numeric")
    .addColumn("total_cost", "numeric")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("stock_movements").dropColumn("unit_cost").dropColumn("total_cost").execute();
}
