export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface ActionCenterAlert {
  type: string;
  severity: AlertSeverity;
  branchId: string | null;
  branchName: string | null;
  description: string;
  detail?: string;
}

export interface ActionCenterReport {
  from: string;
  to: string;
  alerts: ActionCenterAlert[];
  countsBySeverity: Record<AlertSeverity, number>;
}

// قراءة عبر Inventory/Payment Control/Production/Expenses/Procurement/CRM مباشرة - نفس فلسفة
// DashboardSummaryReaderPort بالظبط. راجع food-cost-calculator.ts لتعليق مشابه عن قرارات نطاق موثّقة:
// بعض تنبيهات db/action-center.js بالريبو القديم (أوامر شراء متأخرة عن معاد تسليم متوقع، فروق تحويل
// مفتوحة) مش موجودة هنا لأن neo نفسه لسه مبناش المفاهيم دي (مفيش expected_delivery_date على
// purchase_orders، ومفيش transfer_discrepancy منفصل عن سطر التحويل نفسه) - مش تخمين، قرار موثّق.
export interface ActionCenterReaderPort {
  getAlerts(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<ActionCenterReport>;
}

export const ACTION_CENTER_READER = Symbol("ACTION_CENTER_READER");
