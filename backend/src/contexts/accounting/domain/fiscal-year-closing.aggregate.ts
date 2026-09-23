import { randomUUID } from "node:crypto";

export interface FiscalYearClosingProps {
  year: number;
  netIncome: number;
  closedBy: string | null;
  closedAt: Date;
  journalEntryId: string;
}

// FiscalYearClosing - سجل إقفال سنة مالية: قيد إقفال واحد (journalEntryId) بيصفّر كل حسابات الإيرادات/
// تكلفة البضاعة/المصروفات المتحركة في السنة دي على حساب الأرباح المرحّلة. netIncome هنا نسخة مخزّنة
// (snapshot) وقت القفل للعرض السريع في التقارير بس - مصدر الحقيقة الفعلي قيود journal_entries نفسها،
// نفس فلسفة الريبو القديم بالحرف. غير قابل للعكس عن طريق endpoint مخصّص عمدًا (مفيش reopen/undo) -
// أي تصحيح بعد القفل بيبقى بقيد تصحيحي في السنة المفتوحة الحالية.
export class FiscalYearClosing {
  private constructor(
    public readonly id: string,
    private props: FiscalYearClosingProps
  ) {}

  static register(input: { year: number; netIncome: number; closedBy?: string | null; journalEntryId: string }): FiscalYearClosing {
    return new FiscalYearClosing(randomUUID(), {
      year: input.year,
      netIncome: input.netIncome,
      closedBy: input.closedBy ?? null,
      closedAt: new Date(),
      journalEntryId: input.journalEntryId,
    });
  }

  static reconstitute(id: string, props: FiscalYearClosingProps): FiscalYearClosing {
    return new FiscalYearClosing(id, props);
  }

  get year(): number { return this.props.year; }
  get netIncome(): number { return this.props.netIncome; }
  get closedBy(): string | null { return this.props.closedBy; }
  get closedAt(): Date { return this.props.closedAt; }
  get journalEntryId(): string { return this.props.journalEntryId; }
}
