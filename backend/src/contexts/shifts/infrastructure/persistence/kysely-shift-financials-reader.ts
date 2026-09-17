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
    return { cashSales, cardSales, otherSales, orderCount: rows.length };
  }
}
