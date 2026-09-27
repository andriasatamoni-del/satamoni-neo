import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { BranchHealthReaderPort, BranchHealthReport, BranchHealthRow } from "../../domain/ports/branch-health-reader.port";
import { FOOD_COST_READER, type FoodCostReaderPort } from "../../domain/ports/food-cost-reader.port";

@Injectable()
export class KyselyBranchHealthReader implements BranchHealthReaderPort {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    @Inject(FOOD_COST_READER) private readonly foodCostReader: FoodCostReaderPort
  ) {}

  async getBranchHealth(input: { fromTs: Date; toTs: Date }): Promise<BranchHealthReport> {
    const branches = await this.db
      .selectFrom("branches")
      .select(["id", "name"])
      .where("is_central_kitchen", "=", false)
      .orderBy("name")
      .execute();

    const [revenueByBranch, cashByBranch, negativeStockByBranch, complaintsByBranch, foodCostReport] = await Promise.all([
      this.revenueByBranch(input),
      this.cashVarianceByBranch(input),
      this.negativeStockByBranch(),
      this.openComplaintsByBranch(input),
      this.foodCostReader.getByBranch(input),
    ]);
    const foodCostCostByBranch = new Map(foodCostReport.branches.map((b) => [b.branchId, b.actualUsageCost]));

    const rows: BranchHealthRow[] = branches.map((b) => {
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

    return { from: input.fromTs.toISOString().slice(0, 10), to: input.toTs.toISOString().slice(0, 10), branches: rows };
  }

  private async revenueByBranch(input: { fromTs: Date; toTs: Date }): Promise<Map<string, { ordersCount: number; revenue: number }>> {
    const rows = await this.db
      .selectFrom("orders")
      .select(["branch_id"])
      .select((eb) => eb.fn.count("id").as("orders_count"))
      .select((eb) => eb.fn.sum("total").as("revenue"))
      .where("status", "<>", "cancelled")
      .where("created_at", ">=", input.fromTs)
      .where("created_at", "<=", input.toTs)
      .groupBy("branch_id")
      .execute();
    return new Map(rows.map((r) => [r.branch_id, { ordersCount: Number(r.orders_count), revenue: Number(r.revenue ?? 0) }]));
  }

  private async cashVarianceByBranch(
    input: { fromTs: Date; toTs: Date }
  ): Promise<Map<string, { cashVariance: number; pendingReviewCount: number }>> {
    const rows = await this.db
      .selectFrom("cashier_shifts")
      .select(["branch_id"])
      .select((eb) => eb.fn.coalesce(eb.fn.sum("cash_variance"), eb.lit(0)).as("total_variance"))
      .select((eb) => eb.fn.count("id").filterWhere("variance_status", "=", "PENDING_REVIEW").as("pending_review_count"))
      .where("status", "in", ["CLOSED", "PENDING_REVIEW"])
      .where("closed_at", ">=", input.fromTs)
      .where("closed_at", "<=", input.toTs)
      .groupBy("branch_id")
      .execute();
    return new Map(
      rows.map((r) => [r.branch_id, { cashVariance: Number(r.total_variance), pendingReviewCount: Number(r.pending_review_count) }])
    );
  }

  private async negativeStockByBranch(): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom("branch_stock_balances")
      .select(["branch_id"])
      .select((eb) => eb.fn.count("inventory_item_id").as("item_count"))
      .where("quantity", "<", 0)
      .groupBy("branch_id")
      .execute();
    return new Map(rows.map((r) => [r.branch_id, Number(r.item_count)]));
  }

  private async openComplaintsByBranch(input: { fromTs: Date; toTs: Date }): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom("complaints")
      .select(["branch_id"])
      .select((eb) => eb.fn.count("id").as("open_count"))
      .where("status", "in", ["open", "in_progress"])
      .where("branch_id", "is not", null)
      .where("created_at", ">=", input.fromTs)
      .where("created_at", "<=", input.toTs)
      .groupBy("branch_id")
      .execute();
    return new Map(rows.filter((r) => r.branch_id !== null).map((r) => [r.branch_id as string, Number(r.open_count)]));
  }
}
