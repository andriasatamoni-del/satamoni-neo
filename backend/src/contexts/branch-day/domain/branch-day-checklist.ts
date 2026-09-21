// نفس مفهوم buildChecklist في الريبو القديم بالظبط (routes/branch-days.js) - أحمر/أصفر/أخضر، أحمر
// بيمنع القفل. "PENDING_PURCHASE_REVIEW" مش موجود هنا عمدًا - النظام الجديد لسه معندوش مفهوم "مشترى
// نقدي محتاج مراجعة منفصلة" (مصروفات/مشتريات الشيفت بتترحّل فورًا، راجع CashDrawerEntry) فمفيش بند
// مقابل يتفحص
export interface BranchDayRedItem {
  code: "ACTIVE_SHIFTS" | "PENDING_REVIEW_SHIFTS" | "OPEN_ORDERS" | "UNSETTLED_DRIVER_CASH";
  message: string;
}

export interface BranchDayYellowItem {
  code: "REVIEWED_VARIANCE_TODAY";
  message: string;
}

export type BranchDayChecklistColor = "RED" | "YELLOW" | "GREEN";

export interface BranchDayChecklist {
  color: BranchDayChecklistColor;
  redItems: BranchDayRedItem[];
  yellowItems: BranchDayYellowItem[];
  canClose: boolean;
}

export function classifyChecklist(redItems: BranchDayRedItem[], yellowItems: BranchDayYellowItem[]): BranchDayChecklist {
  const color: BranchDayChecklistColor = redItems.length > 0 ? "RED" : yellowItems.length > 0 ? "YELLOW" : "GREEN";
  return { color, redItems, yellowItems, canClose: redItems.length === 0 };
}
