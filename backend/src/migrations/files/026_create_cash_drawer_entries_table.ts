import { Kysely, sql } from "kysely";

// مصروفات ومشتريات نقدية بتتسجل من درج الشيفت الشغال (زي expenses/purchases في الريبو القديم، بس هنا
// كبند واحد مبسّط - راجع تعليق CashDrawerEntry.aggregate). أول استخدام لعمودين cash_expenses_total/
// cash_purchases_total على cashier_shifts نفسها (بتتجمّد وقت القفل زي أي رقم مالي تاني في الشيفت).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("cash_drawer_entries")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("shift_id", "uuid", (col) => col.notNull().references("cashier_shifts.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id"))
    .addColumn("entry_type", "text", (col) => col.notNull().check(sql`entry_type IN ('EXPENSE','PURCHASE')`))
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_by", "uuid", (col) => col.notNull().references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_cash_drawer_entries_shift ON cash_drawer_entries (shift_id)`.execute(db);
  await sql`CREATE INDEX idx_cash_drawer_entries_branch_user_time ON cash_drawer_entries (branch_id, user_id, created_at)`.execute(db);

  await sql`ALTER TABLE cashier_shifts ADD COLUMN cash_expenses_total numeric NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE cashier_shifts ADD COLUMN cash_purchases_total numeric NOT NULL DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cashier_shifts DROP COLUMN cash_purchases_total`.execute(db);
  await sql`ALTER TABLE cashier_shifts DROP COLUMN cash_expenses_total`.execute(db);
  await db.schema.dropTable("cash_drawer_entries").execute();
}
