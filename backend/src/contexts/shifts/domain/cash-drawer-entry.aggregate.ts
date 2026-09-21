import { randomUUID } from "node:crypto";
import { CashDrawerEntryLabelRequiredError, InvalidCashDrawerEntryAmountError } from "./errors";

export const CASH_DRAWER_ENTRY_TYPES = ["EXPENSE", "PURCHASE"] as const;
export type CashDrawerEntryType = (typeof CASH_DRAWER_ENTRY_TYPES)[number];

export interface CashDrawerEntryProps {
  shiftId: string;
  branchId: string;
  userId: string;
  entryType: CashDrawerEntryType;
  amount: number;
  label: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

// CashDrawerEntry - مصروف أو مشترى نقدي اتسجل من درج الكاشير أثناء شيفته (نفس مفهوم expenses/purchases
// في الريبو القديم، لكن هنا كبند واحد مبسّط بدل جدولين منفصلين - راجع تعليق Treasury.aggregate: درج
// الكاشير أثناء شيفته اتمثّل عمدًا كـCashierShift مش كخزينة تالتة، فالبند ده جزء من نفس الـcontext).
// الفلوس بتتسجل كـ"خرجت من الدرج" وقت التسجيل نفسه فورًا - مفيش حالة "معلّق"/مراجعة قبل ما تدخل حساب
// الكاش المتوقع (نفس فلسفة الريبو القديم بالظبط: راجع تعليق computeShiftFinancials هناك)
export class CashDrawerEntry {
  private constructor(
    public readonly id: string,
    private props: CashDrawerEntryProps
  ) {}

  static register(input: {
    shiftId: string;
    branchId: string;
    userId: string;
    entryType: string;
    amount: number;
    label: string;
    notes?: string | null;
    createdBy: string;
  }): CashDrawerEntry {
    if (!CASH_DRAWER_ENTRY_TYPES.includes(input.entryType as CashDrawerEntryType)) {
      throw new InvalidCashDrawerEntryAmountError();
    }
    if (!(Number(input.amount) > 0)) throw new InvalidCashDrawerEntryAmountError();
    if (!input.label || !input.label.trim()) throw new CashDrawerEntryLabelRequiredError();

    return new CashDrawerEntry(randomUUID(), {
      shiftId: input.shiftId,
      branchId: input.branchId,
      userId: input.userId,
      entryType: input.entryType as CashDrawerEntryType,
      amount: Number(input.amount),
      label: input.label.trim(),
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: CashDrawerEntryProps): CashDrawerEntry {
    return new CashDrawerEntry(id, props);
  }

  get shiftId(): string { return this.props.shiftId; }
  get branchId(): string { return this.props.branchId; }
  get userId(): string { return this.props.userId; }
  get entryType(): CashDrawerEntryType { return this.props.entryType; }
  get amount(): number { return this.props.amount; }
  get label(): string { return this.props.label; }
  get notes(): string | null { return this.props.notes; }
  get createdBy(): string { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
}
