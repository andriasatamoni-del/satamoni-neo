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
  talabatPrice: number | null;
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

// قراءة عبر Orders/Catalog/Inventory مباشرة - نفس فلسفة باقي قرّاء التقارير بالظبط. قرارات نطاق موثّقة:
// - item-performance/recipes: التكلفة هنا بسعر الوحدة *الحالي* للمكوّن، مش "مجمّدة وقت البيع" زي
//   الريبو القديم (order_items.cost_at_sale) - neo لسه معندوش عمود مماثل على order_items، بس
//   stock_movements نفسها بقت بتجمّد التكلفة (راجع محرك تكلفة الطعام) فالتقرير ده بديل تقريبي مقبول
//   للمراجعة السريعة، مش مصدر حقيقة محاسبي دقيق
// - delays: neo معندوش order_status_log (سجل كل تحوّل حالة) - بيستخدم kitchen_ready_at بدل أول تحوّل
//   حالة بعد "preparing"، وده نفس المعنى عمليًا (وقت ما الطلب بقى جاهز)
// - cancelled-orders: neo معندوش تمييز منفصل بين "اتلغى قبل التنفيذ" و"استرجاع بعد الاكتمال" (voided)،
//   ومعندوش عمود سبب الإلغاء - القائمة والإجمالي بس، بدون تقسيم الأسباب
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
