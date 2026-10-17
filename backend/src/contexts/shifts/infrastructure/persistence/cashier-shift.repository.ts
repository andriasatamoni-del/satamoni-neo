import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { CashierShift, type ShiftStatus, type VarianceStatus } from "../../domain/cashier-shift.aggregate";
import type { CashierShiftRepositoryPort, ShiftListFilter } from "../../domain/ports/cashier-shift-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, paginate, totalOf } from "../../../../shared/database/pagination";
import { cashierShifts } from "./shifts.tables";

@Injectable()
export class CashierShiftRepository implements CashierShiftRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(shift: CashierShift): Promise<void> {
    const [existing] = await this.db.select({ id: cashierShifts.id }).from(cashierShifts).where(eq(cashierShifts.id, shift.id)).limit(1);

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
      await this.db.update(cashierShifts).set(values).where(eq(cashierShifts.id, shift.id));
      return;
    }
    await this.db.insert(cashierShifts).values({
      id: shift.id,
      branch_id: shift.branchId,
      user_id: shift.userId,
      opened_at: shift.openedAt,
      opening_cash: shift.openingCash,
      opening_notes: shift.openingNotes,
      ...values,
    });
  }

  async findById(id: string): Promise<CashierShift | null> {
    const [row] = await this.db.select().from(cashierShifts).where(eq(cashierShifts.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findActiveByUserId(userId: string): Promise<CashierShift | null> {
    const [row] = await this.db
      .select()
      .from(cashierShifts)
      .where(and(eq(cashierShifts.user_id, userId), eq(cashierShifts.status, "ACTIVE")))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter: ShiftListFilter, page: PageRequest): Promise<{ shifts: CashierShift[]; total: number }> {
    const where = and(
      eq(cashierShifts.branch_id, filter.branchId),
      filter.status ? eq(cashierShifts.status, filter.status) : undefined,
      businessDayRangeCondition(cashierShifts.opened_at, filter.from, filter.to)
    );
    const query = this.db.select().from(cashierShifts).where(where).orderBy(desc(cashierShifts.opened_at), desc(cashierShifts.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(cashierShifts).where(where)));
    return { shifts: rows.map((row) => this.toDomain(row)), total };
  }

  private toDomain(row: typeof cashierShifts.$inferSelect): CashierShift {
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
