import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, gte, inArray, isNotNull, lt, lte, ne, sql, sum } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { complaints } from "../../../crm/infrastructure/persistence/crm.tables";
import { branchStockBalances } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { cashierShifts } from "../../../shifts/infrastructure/persistence/shifts.tables";
import type { BranchHealthReaderPort, BranchHealthReport, BranchHealthRow } from "../../domain/ports/branch-health-reader.port";
import { FOOD_COST_READER, type FoodCostReaderPort } from "../../domain/ports/food-cost-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

@Injectable()
export class BranchHealthReader implements BranchHealthReaderPort {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(FOOD_COST_READER) private readonly foodCostReader: FoodCostReaderPort
  ) {}

  async getBranchHealth(input: { fromTs: Date; toTs: Date }): Promise<BranchHealthReport> {
    const branchRows = await this.db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.is_central_kitchen, false))
      .orderBy(asc(branches.name));

    const [revenueByBranch, cashByBranch, negativeStockByBranch, complaintsByBranch, foodCostReport] = await Promise.all([
      this.revenueByBranch(input),
      this.cashVarianceByBranch(input),
      this.negativeStockByBranch(),
      this.openComplaintsByBranch(input),
      this.foodCostReader.getByBranch(input),
    ]);
    const foodCostCostByBranch = new Map(foodCostReport.branches.map((b) => [b.branchId, b.actualUsageCost]));

    const rows: BranchHealthRow[] = branchRows.map((b) => {
      const revenue = revenueByBranch.get(b.id) ?? { ordersCount: 0, revenue: 0 };
      const cash = cashByBranch.get(b.id) ?? { cashVariance: 0, pendingReviewCount: 0 };
      const foodCost = foodCostCostByBranch.get(b.id) ?? 0;
      return {
        branchId: b.id,
        branchName: b.name,
        ordersCount: revenue.ordersCount,
        revenue: revenue.revenue,
        avgOrderValue: revenue.ordersCount > 0 ? revenue.revenue / revenue.ordersCount : 0,
        foodCostPercent: revenue.revenue > 0 ? (foodCost / revenue.revenue) * 100 : null,
        cashVariance: cash.cashVariance,
        shiftsPendingReview: cash.pendingReviewCount,
        negativeStockItems: negativeStockByBranch.get(b.id) ?? 0,
        openComplaints: complaintsByBranch.get(b.id) ?? 0,
      };
    });

    return { from: businessDateString(input.fromTs), to: businessDateString(input.toTs), branches: rows };
  }

  private async revenueByBranch(input: { fromTs: Date; toTs: Date }): Promise<Map<string, { ordersCount: number; revenue: number }>> {
    const rows = await this.db
      .select({ branch_id: orders.branch_id, orders_count: count(orders.id), revenue: sum(orders.total) })
      .from(orders)
      .where(and(ne(orders.status, "cancelled"), gte(orders.created_at, input.fromTs), lte(orders.created_at, input.toTs)))
      .groupBy(orders.branch_id);
    return new Map(rows.map((r) => [r.branch_id, { ordersCount: Number(r.orders_count), revenue: Number(r.revenue ?? 0) }]));
  }

  private async cashVarianceByBranch(
    input: { fromTs: Date; toTs: Date }
  ): Promise<Map<string, { cashVariance: number; pendingReviewCount: number }>> {
    const rows = await this.db
      .select({
        branch_id: cashierShifts.branch_id,
        total_variance: sql<string>`COALESCE(SUM(${cashierShifts.cash_variance}), 0)`,
        pending_review_count: sql<string>`COUNT(${cashierShifts.id}) FILTER (WHERE ${cashierShifts.variance_status} = 'PENDING_REVIEW')`,
      })
      .from(cashierShifts)
      .where(
        and(
          inArray(cashierShifts.status, ["CLOSED", "PENDING_REVIEW"]),
          gte(cashierShifts.closed_at, input.fromTs),
          lte(cashierShifts.closed_at, input.toTs)
        )
      )
      .groupBy(cashierShifts.branch_id);
    return new Map(
      rows.map((r) => [r.branch_id, { cashVariance: Number(r.total_variance), pendingReviewCount: Number(r.pending_review_count) }])
    );
  }

  private async negativeStockByBranch(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ branch_id: branchStockBalances.branch_id, item_count: count(branchStockBalances.inventory_item_id) })
      .from(branchStockBalances)
      .where(lt(branchStockBalances.quantity, 0))
      .groupBy(branchStockBalances.branch_id);
    return new Map(rows.map((r) => [r.branch_id, Number(r.item_count)]));
  }

  private async openComplaintsByBranch(input: { fromTs: Date; toTs: Date }): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ branch_id: complaints.branch_id, open_count: count(complaints.id) })
      .from(complaints)
      .where(
        and(
          inArray(complaints.status, ["open", "in_progress"]),
          isNotNull(complaints.branch_id),
          gte(complaints.created_at, input.fromTs),
          lte(complaints.created_at, input.toTs)
        )
      )
      .groupBy(complaints.branch_id);
    return new Map(rows.filter((r) => r.branch_id !== null).map((r) => [r.branch_id as string, Number(r.open_count)]));
  }
}
