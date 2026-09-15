import { Kysely, sql } from "kysely";

// Branches - context أساسي كان ناقص من خريطة bounded contexts الأصلية (راجع تعليق branch.aggregate.ts)
// بيتبنى دلوقتي قبل المخزون مباشرة لأن أرصدة المخزون لازم تتربط بفرع حقيقي، مش legacy_branch_id بس
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("branches")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("address", "text")
    .addColumn("phone", "text")
    .addColumn("hours", "text")
    .addColumn("lat", "numeric")
    .addColumn("lng", "numeric")
    .addColumn("is_central_kitchen", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("supports_dine_in", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_branch_id", "integer")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("branches").execute();
}
