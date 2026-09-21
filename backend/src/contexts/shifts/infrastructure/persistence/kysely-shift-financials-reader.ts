import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { ShiftFinancials } from "../../domain/cashier-shift.aggregate";
import type { ShiftFinancialsReaderPort } from "../../domain/ports/shift-financials-reader.port";

@Injectable()
export class KyselyShiftFinancialsReader implements ShiftFinancialsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async computeFinancials(input: { branchId: string; userId: string; fromTs: Date; toTs: Date }): Promise<ShiftFinancials> {
    const rows = await this.db
      .selectFrom("orders")
      .leftJoin("payments", "payments.order_id", "orders.id")
      .select(["orders.id as order_id", "orders.total as total", "payments.method_kind as method_kind"])
      .where("orders.branch_id", "=", input.branchId)
      .where("orders.created_by", "=", input.userId)
      .where("orders.created_at", ">=", input.fromTs)
      .where("orders.created_at", "<=", input.toTs)
      .where("orders.status", "<>", "cancelled")
      .execute();

    let cashSales = 0;
    let cardSales = 0;
    let otherSales = 0;
    for (const row of rows) {
      const total = Number(row.total);
      if (row.method_kind === "cash") cashSales += total;
      else if (row.method_kind === "card_or_wallet") cardSales += total;
      else otherSales += total;
    }

    // مصروفات/مشتريات نقدية اتسجلت من نفس درج الشيفت ده أثناء نفس النافذة الزمنية - بتتخصم من الكاش
    // المتوقع لأن الفلوس خرجت من الدرج فعليًا وقت التسجيل (نفس فلسفة cash_expenses_total/
    // cash_purchases_total في db/shift-engine.js بالريبو القديم بالظبط)
    const entryRows = await this.db
      .selectFrom("cash_drawer_entries")
      .select(["entry_type", "amount"])
      .where("branch_id", "=", input.branchId)
      .where("user_id", "=", input.userId)
      .where("created_at", ">=", input.fromTs)
      .where("created_at", "<=", input.toTs)
      .execute();

    let cashExpensesTotal = 0;
    let cashPurchasesTotal = 0;
    for (const row of entryRows) {
      if (row.entry_type === "EXPENSE") cashExpensesTotal += Number(row.amount);
      else cashPurchasesTotal += Number(row.amount);
    }

    return { cashSales, cardSales, otherSales, orderCount: rows.length, cashExpensesTotal, cashPurchasesTotal };
  }
}
