import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { payments } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import type { ShiftFinancials } from "../../domain/cashier-shift.aggregate";
import type { ShiftFinancialsReaderPort } from "../../domain/ports/shift-financials-reader.port";
import { cashDrawerEntries } from "./shifts.tables";

@Injectable()
export class ShiftFinancialsReader implements ShiftFinancialsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async computeFinancials(input: { branchId: string; userId: string; fromTs: Date; toTs: Date }): Promise<ShiftFinancials> {
    const rows = await this.db
      .select({ order_id: orders.id, total: orders.total, method_kind: payments.method_kind })
      .from(orders)
      .leftJoin(payments, eq(payments.order_id, orders.id))
      .where(
        and(
          eq(orders.branch_id, input.branchId),
          eq(orders.created_by, input.userId),
          gte(orders.created_at, input.fromTs),
          lte(orders.created_at, input.toTs),
          ne(orders.status, "cancelled")
        )
      );

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
      .select({ entry_type: cashDrawerEntries.entry_type, amount: cashDrawerEntries.amount })
      .from(cashDrawerEntries)
      .where(
        and(
          eq(cashDrawerEntries.branch_id, input.branchId),
          eq(cashDrawerEntries.user_id, input.userId),
          gte(cashDrawerEntries.created_at, input.fromTs),
          lte(cashDrawerEntries.created_at, input.toTs)
        )
      );

    let cashExpensesTotal = 0;
    let cashPurchasesTotal = 0;
    for (const row of entryRows) {
      if (row.entry_type === "EXPENSE") cashExpensesTotal += Number(row.amount);
      else cashPurchasesTotal += Number(row.amount);
    }

    return { cashSales, cardSales, otherSales, orderCount: rows.length, cashExpensesTotal, cashPurchasesTotal };
  }
}
