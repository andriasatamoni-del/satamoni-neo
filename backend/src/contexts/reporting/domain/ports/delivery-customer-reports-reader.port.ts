export interface DriverPerformanceRow {
  driverId: string; driverName: string; ordersCount: number; revenue: number;
  failedCount: number; avgDeliveryMinutes: number | null;
}

export interface DeliveryServiceReport {
  thresholdMinutes: number; totalOrders: number; failedCount: number; failureRate: number | null;
  avgPrepMinutes: number | null; avgDeliveryMinutes: number | null; avgTotalMinutes: number | null;
  onTimeRate: number | null;
}

export interface PeakHoursReport {
  byHour: { hour: number; ordersCount: number; revenue: number }[];
  byDayOfWeek: { dow: number; dayName: string; ordersCount: number; revenue: number }[];
}

export interface CustomerSpendRow {
  phone: string; name: string | null; ordersCount: number; totalSpent: number; avgOrderValue: number; lastOrderAt: string;
}
export interface CustomerSpendReport {
  newCustomersCount: number;
  topCustomers: CustomerSpendRow[];
}

export interface ExpensesReportRow {
  id: string; businessDate: string; branchId: string; branchName: string | null;
  category: string; amount: number; alertThreshold: number; notes: string | null;
}
export interface ExpensesReport {
  total: number;
  byCategory: { category: string; total: number; count: number }[];
  trend: { period: string; total: number }[];
  anomalies: ExpensesReportRow[];
}

export interface PurchasesReport {
  total: number;
  byCategory: { category: string; total: number; count: number }[];
  trend: { period: string; total: number }[];
}

// قراءة عبر Delivery/Orders/Customers/Expenses/Purchases مباشرة. قرارات نطاق موثّقة:
// - areas-performance (الريبو القديم) مش موجودة هنا خالص - neo معندوش مفهوم "منطقة توصيل" (delivery_areas)
//   أصلًا، ولا عمود delivery_area_id على الأوردر. مفيش بديل معقول من غير تصميم مفهوم جديد بالكامل.
// - waste (الريبو القديم) مش موجودة هنا خالص - stock_movements.movement_type في neo (راجع
//   MOVEMENT_TYPES في stock-movement.aggregate.ts) معندوش نوع 'WASTE' مخصّص، وADJUSTMENT عام مش مميّز
//   بسبب/فئة هالك - مفيش طريقة موثوقة نفرّق بيها الهالك عن أي تصحيح تاني للمخزون.
// - purchases-report هنا من غير تقسيم byKitchen زي الريبو القديم - neo مربوط بـsupplier_id اختياري
//   بدل علم boolean "from_kitchen"، ومفيش خاصية "سنتر كيتشن" على المورد نفسه (هي خاصية فرع مش مورد) -
//   التقسيم مش له معنى مكافئ في الموديل الجديد.
// - delivery-service هنا بيستخدم delivery_assignments.assigned_at/delivered_at (كيان حقيقي في neo)
//   بدل order_status_log (مش موجود في neo) - onTimeRate بيقارن kitchen_ready_at بالحد المسموح، نفس
//   منطق تقرير delays الموجود بالفعل (REPORT2-4)، عشان الاتساق بين التقريرين.
export interface DeliveryCustomerReportsReaderPort {
  getDrivers(input: { branchId: string | null; from: string; to: string }): Promise<DriverPerformanceRow[]>;
  getDeliveryService(input: { branchId: string | null; from: string; to: string; thresholdMinutes: number }): Promise<DeliveryServiceReport>;
  getPeakHours(input: { branchId: string | null; from: string; to: string }): Promise<PeakHoursReport>;
  getCustomerSpend(input: { branchId: string | null; from: string; to: string; limit: number }): Promise<CustomerSpendReport>;
  getExpensesReport(input: { branchId: string | null; from: string; to: string; groupBy: "day" | "month" }): Promise<ExpensesReport>;
  getPurchasesReport(input: { branchId: string | null; from: string; to: string; groupBy: "day" | "month" }): Promise<PurchasesReport>;
}

export const DELIVERY_CUSTOMER_REPORTS_READER = Symbol("DELIVERY_CUSTOMER_REPORTS_READER");
