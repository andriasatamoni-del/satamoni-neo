export interface DashboardSummary {
  from: string;
  to: string;
  revenue: number;
  orderCount: number;
  cancelledCount: number;
  avgOrderValue: number;
  dailyTrend: { date: string; revenue: number }[];
  topItemsByRevenue: { menuItemId: string; name: string; quantity: number; revenue: number }[];
  revenueByBranch: { branchId: string; name: string; revenue: number; orderCount: number }[];
  orderStatusBreakdown: { status: string; count: number }[];
  paymentMethodBreakdown: { paymentMethodId: string; name: string; amount: number }[];
}

// قراءة عبر Orders/Payment Control/Catalog/Branches مباشرة - نفس فلسفة ShiftFinancialsReaderPort
// بالظبط (context تقارير للقراءة بس، مفيهوش aggregate خاص بيه، بيقرا جداول context تانية مباشرة)
export interface DashboardSummaryReaderPort {
  getSummary(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<DashboardSummary>;
}

export const DASHBOARD_SUMMARY_READER = Symbol("DASHBOARD_SUMMARY_READER");
