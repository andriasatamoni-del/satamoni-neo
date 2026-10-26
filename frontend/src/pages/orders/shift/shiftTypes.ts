export interface Shift {
  id: string;
  branchId: string;
  status: string;
  openingCash: number;
  cashVariance: number | null;
  varianceStatus: string;
}

export interface ShiftPreview {
  cashSales: number;
  cardSales: number;
  otherSales: number;
  orderCount: number;
  openingCash: number;
  expectedCash: number;
  cashExpensesTotal: number;
  cashPurchasesTotal: number;
}

export type CashEntryType = "EXPENSE" | "PURCHASE";

export interface CashDrawerEntry {
  id: string;
  entryType: CashEntryType;
  amount: number;
  label: string;
  notes: string | null;
  createdAt: string;
}

export const VARIANCE_LABELS: Record<string, string> = {
  NONE: "بدون فرق", PENDING_REVIEW: "محتاج مراجعة", APPROVED: "اتعتمد", ACKNOWLEDGED: "اتّقر",
};

export const CASH_ENTRY_TYPE_LABELS: Record<CashEntryType, string> = { EXPENSE: "مصروف", PURCHASE: "مشترى" };

export const SHIFT_QUERY_KEYS = {
  current: ["shifts", "current"],
  preview: (shiftId: string) => ["shifts", shiftId, "preview"],
  cashDrawerEntries: (shiftId: string) => ["shifts", shiftId, "cash-drawer-entries"],
};
