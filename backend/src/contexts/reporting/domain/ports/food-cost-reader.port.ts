import type { FoodCostBucket } from "../food-cost-calculator";

export interface FoodCostItemRow extends FoodCostBucket {
  inventoryItemId: string;
  itemName: string;
}

export interface FoodCostBranchRow extends FoodCostBucket {
  branchId: string;
  branchName: string;
}

export interface FoodCostReport {
  from: string;
  to: string;
  totals: FoodCostBucket;
  byItem: FoodCostItemRow[];
}

export interface FoodCostByBranchReport {
  from: string;
  to: string;
  branches: FoodCostBranchRow[];
}

// قراءة عبر Inventory مباشرة (stock_movements/inventory_items/branches) - نفس فلسفة
// DashboardSummaryReaderPort بالظبط: context تقارير للقراءة بس
export interface FoodCostReaderPort {
  getVariance(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<FoodCostReport>;
  getByBranch(input: { fromTs: Date; toTs: Date }): Promise<FoodCostByBranchReport>;
}

export const FOOD_COST_READER = Symbol("FOOD_COST_READER");
