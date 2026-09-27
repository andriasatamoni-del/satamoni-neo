export interface BranchHealthRow {
  branchId: string;
  branchName: string;
  ordersCount: number;
  revenue: number;
  avgOrderValue: number;
  foodCostPercent: number | null;
  cashVariance: number;
  shiftsPendingReview: number;
  negativeStockItems: number;
  openComplaints: number;
}

export interface BranchHealthReport {
  from: string;
  to: string;
  branches: BranchHealthRow[];
}

// قراءة عبر Orders/Shifts/Inventory/CRM مباشرة + إعادة استخدام FoodCostReaderPort - نفس فلسفة
// db/branch-health.js بالريبو القديم بالظبط: صفر منطق تجاري جديد، كل رقم من نفس مصدره الأصلي.
// قرار نطاق موثّق: عمود "أيام التأخير" (lateness) في الريبو القديم مستبعد هنا لأن neo لسه معندوش
// مفهوم "وقت بداية شيفت مجدول" يتقارن بيه وقت الحضور الفعلي (employee_attendance_shifts فيها
// checked_in_at بس، مفيش scheduled_start) - مش تخمين لرقم مش موجود أصلًا.
export interface BranchHealthReaderPort {
  getBranchHealth(input: { fromTs: Date; toTs: Date }): Promise<BranchHealthReport>;
}

export const BRANCH_HEALTH_READER = Symbol("BRANCH_HEALTH_READER");
