import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { CashierShift, type ShiftStatus, type VarianceStatus } from "../../domain/cashier-shift.aggregate";
import type { CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import type { CashierShiftsTable } from "./cashier-shift.schema";

@Injectable()
export class KyselyCashierShiftRepository implements CashierShiftRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(shift: CashierShift): Promise<void> {
    const existing = await this.db
      .selectFrom("cashier_shifts")
      .select("id")
      .where("id", "=", shift.id)
      .executeTakeFirst();

    const values = {
      status: shift.status,
      closed_at: shift.closedAt,
      closed_by: shift.closedBy,
      actual_cash: shift.actualCash,
      expected_cash: shift.expectedCash,
      cash_variance: shift.cashVariance,
      closing_notes: shift.closingNotes,
      cash_sales: shift.cashSales,
      card_sales: shift.cardSales,
      other_sales: shift.otherSales,
      order_count: shift.orderCount,
      cash_expenses_total: shift.cashExpensesTotal,
      cash_purchases_total: shift.cashPurchasesTotal,
      variance_status: shift.varianceStatus,
      variance_reviewed_by: shift.varianceReviewedBy,
      variance_reviewed_at: shift.varianceReviewedAt,
      variance_review_notes: shift.varianceReviewNotes,
      updated_at: new Date(),
    };

    if (existing) {
      await this.db.updateTable("cashier_shifts").set(values).where("id", "=", shift.id).execute();
      return;
    }
    await this.db
      .insertInto("cashier_shifts")
      .values({
        id: shift.id,
        branch_id: shift.branchId,
        user_id: shift.userId,
        opened_at: shift.openedAt,
        opening_cash: shift.openingCash,
        opening_notes: shift.openingNotes,
        ...values,
      })
      .execute();
  }

  async findById(id: string): Promise<CashierShift | null> {
    const row = await this.db.selectFrom("cashier_shifts").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findActiveByUserId(userId: string): Promise<CashierShift | null> {
    const row = await this.db
      .selectFrom("cashier_shifts")
      .selectAll()
      .where("user_id", "=", userId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter: { branchId: string; status?: string }): Promise<CashierShift[]> {
    let query = this.db.selectFrom("cashier_shifts").selectAll().where("branch_id", "=", filter.branchId);
    if (filter.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("opened_at", "desc").limit(200).execute();
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: Selectable<CashierShiftsTable>): CashierShift {
    return CashierShift.reconstitute(row.id, {
      branchId: row.branch_id,
      userId: row.user_id,
      status: row.status as ShiftStatus,
      openedAt: row.opened_at,
      openingCash: Number(row.opening_cash),
      openingNotes: row.opening_notes,
      closedAt: row.closed_at,
      closedBy: row.closed_by,
      actualCash: row.actual_cash === null ? null : Number(row.actual_cash),
      expectedCash: row.expected_cash === null ? null : Number(row.expected_cash),
      cashVariance: row.cash_variance === null ? null : Number(row.cash_variance),
      closingNotes: row.closing_notes,
      cashSales: Number(row.cash_sales),
      cardSales: Number(row.card_sales),
      otherSales: Number(row.other_sales),
      orderCount: row.order_count,
      cashExpensesTotal: Number(row.cash_expenses_total),
      cashPurchasesTotal: Number(row.cash_purchases_total),
      varianceStatus: row.variance_status as VarianceStatus,
      varianceReviewedBy: row.variance_reviewed_by,
      varianceReviewedAt: row.variance_reviewed_at,
      varianceReviewNotes: row.variance_review_notes,
    });
  }
}
