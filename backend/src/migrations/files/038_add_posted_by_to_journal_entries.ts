import { Kysely, sql } from "kysely";

// posted_by منفصل عن created_by - القيد اليدوي بيتسجّل (created_by) DRAFT بواسطة محاسب، وبيترحّل
// (posted_by) بواسطة حد تاني معاه صلاحية accounting.post منفصلة (راجع تعليق journal-entry.aggregate.ts
// post()) - نفس فصل drafted_by/posted عن created_by في الريبو القديم (posted_by فاضل هناك برضو)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("journal_entries")
    .addColumn("posted_by", "uuid", (col) => col.references("users.id"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE journal_entries DROP COLUMN IF EXISTS posted_by`.execute(db);
}
