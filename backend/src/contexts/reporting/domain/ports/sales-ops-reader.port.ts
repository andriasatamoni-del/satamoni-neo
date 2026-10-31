export interface DailyBranchSummaryRow {
  businessDate: string;
  branchId: string;
  branchName: string;
  ordersCount: number;
  revenue: number;
}

export interface SalesDetailReport {
  from: string;
  to: string;
  branchId: string | null;
  summary: { revenue: number; ordersCount: number; avgOrderValue: number };
  byPaymentMethod: { name: string; kind: string | null; amount: number; count: number }[];
  byOrderType: { orderType: string; amount: number; count: number }[];
  dailyTrend: { date: string; revenue: number; ordersCount: number }[];
}

export interface CancelledOrderRow {
  id: string;
  branchId: string;
  branchName: string | null;
  orderType: string;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
}
export interface CancelledOrdersReport {
  from: string;
  to: string;
  branchId: string | null;
  summary: { totalCount: number; totalValue: number };
  orders: CancelledOrderRow[];
}

export interface DelayedOrderRow {
  id: string;
  branchId: string;
  branchName: string | null;
  orderType: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  prepMinutes: number;
}
export interface DelaysReport {
  from: string;
  to: string;
  branchId: string | null;
  thresholdMinutes: number;
  summary: { totalOrders: number; delayedCount: number; delayedPercent: number; avgPrepMinutes: number };
  delayedOrders: DelayedOrderRow[];
}

export interface ItemPerformanceRow {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  costIncomplete: boolean;
}
export interface ItemPerformanceReport {
  from: string;
  to: string;
  branchId: string | null;
  topByRevenue: ItemPerformanceRow[];
  topByQuantity: ItemPerformanceRow[];
  leastByQuantity: ItemPerformanceRow[];
  leastProfitable: ItemPerformanceRow[];
}

export interface CatalogReportRow {
  itemId: string;
  itemName: string;
  category: string | null;
  isActive: boolean;
  variantId: string;
  label: string;
  price: number;
  quantitySold: number;
  revenue: number;
}
export interface CatalogReport {
  from: string;
  to: string;
  branchId: string | null;
  items: CatalogReportRow[];
}

export interface RecipeReportIngredient {
  ingredient: string;
  unit: string | null;
  quantityPerUnit: number;
  unitCost: number | null;
}
export interface RecipeReportRow {
  itemName: string;
  variantId: string;
  label: string;
  price: number;
  ingredients: RecipeReportIngredient[];
  hasActiveVersion: boolean;
  hasMissingCost: boolean;
}

export interface SalesOpsReaderPort {
  getDailySummary(input: { branchId: string | null; from: string; to: string }): Promise<DailyBranchSummaryRow[]>;
  getSalesDetail(input: { branchId: string | null; from: string; to: string }): Promise<SalesDetailReport>;
  getCancelledOrders(input: { branchId: string | null; from: string; to: string }): Promise<CancelledOrdersReport>;
  getDelays(input: { branchId: string | null; from: string; to: string; thresholdMinutes: number }): Promise<DelaysReport>;
  getItemPerformance(input: { branchId: string | null; from: string; to: string; limit: number }): Promise<ItemPerformanceReport>;
  getCatalogReport(input: { branchId: string | null; from: string; to: string }): Promise<CatalogReport>;
  getRecipesReport(): Promise<RecipeReportRow[]>;
}

export const SALES_OPS_READER = Symbol("SALES_OPS_READER");
