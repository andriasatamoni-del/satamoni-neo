import type { ShiftFinancials } from "../cashier-shift.aggregate";

// قراءة مبيعات الفترة من orders/payments (Orders و Payment Control context تانيين) - port منفصل عن
// CashierShiftRepositoryPort لأنه بيقرا بيانات مش بتاعة الـshift context نفسه (نفس فلسفة الفصل بين
// الكتابة على الأجريجيت والقراءة عبر السياقات). بيحسب بالفرع + الكاشير (created_by) + نافذة الوقت -
// بديل لـshift_id FK على orders (مؤجّل، راجع تعليق OrderProps في order.aggregate.ts) لأن قيد "شيفت
// واحد نشط لكل كاشير" (migration 013) بيخلي فرع+كاشير+نافذة وقت مكافئ عمليًا لنفس النتيجة
export interface ShiftFinancialsReaderPort {
  computeFinancials(input: { branchId: string; userId: string; fromTs: Date; toTs: Date }): Promise<ShiftFinancials>;
}

export const SHIFT_FINANCIALS_READER = Symbol("SHIFT_FINANCIALS_READER");
