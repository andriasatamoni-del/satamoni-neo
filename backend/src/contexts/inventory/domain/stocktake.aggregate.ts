import { randomUUID } from "node:crypto";
import { EmptyStocktakeError, InvalidStocktakeQuantityError } from "./errors";

// كود الحساب الافتراضي لترحيل فرق الجرد لو مفيش كود متحدد صراحةً - نفس كود الريبو القديم الافتراضي
// بالظبط ("تكلفة بضاعة مباعة أخرى")
export const DEFAULT_VARIANCE_CHARGE_ACCOUNT_CODE = "5300";

export interface StocktakeLine {
  id: string;
  inventoryItemId: string;
  systemQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  unitCost: number | null;
  varianceValue: number | null;
  reason: string | null;
  chargeAccountCode: string | null;
  inventoryMovementId: string | null;
}

export interface StocktakeProps {
  branchId: string;
  createdBy: string | null;
  notes: string | null;
  lines: StocktakeLine[];
  totalVarianceValue: number;
  createdAt: Date;
}

// Stocktake - نفس مفهوم جلسة الجرد الفعلي (Spot Check) في الريبو القديم بالظبط: جلسة واحدة (header)
// بسطر لكل خامة اتعدّت فعليًا. الخامات اللي الفرق فيها صفر (الرصيد مطابق) مش بتتسجل كسطر خالص - عشان
// السجل يفضل يوريك الفروق الحقيقية بس (لو كل البنود المُدخلة طلعت مطابقة، الجلسة بتتسجل برضو بس من
// غير أي سطور، totalVarianceValue=0 - نفس سلوك الريبو القديم بالظبط). تحميل العجز على موظف بعينه
// (سلفة) مؤجّل هنا - نفس تأجيل عجز شيفت الكاشير بالظبط (راجع تعليق migration 013 وCashierShift) - كل
// فرق بيترحّل لحساب محاسبي عادي بس (افتراضيًا 5300). مفيش تصحيحات لاحقة لسطر (stocktake_line_corrections
// في الريبو القديم) - تبسيط متعمّد، أي غلط محتاج جلسة جرد جديدة
export class Stocktake {
  private constructor(
    public readonly id: string,
    private props: StocktakeProps
  ) {}

  static register(input: {
    branchId: string;
    createdBy?: string | null;
    notes?: string | null;
    lines: {
      inventoryItemId: string;
      systemQuantity: number;
      actualQuantity: number;
      unitCost: number | null;
      reason?: string | null;
      chargeAccountCode?: string | null;
    }[];
  }): Stocktake {
    if (input.lines.length === 0) throw new EmptyStocktakeError();

    const lines: StocktakeLine[] = [];
    let totalVarianceValue = 0;
    for (const l of input.lines) {
      if (l.actualQuantity < 0 || Number.isNaN(l.actualQuantity)) throw new InvalidStocktakeQuantityError();

      const varianceQuantity = Math.round((l.actualQuantity - l.systemQuantity) * 1000) / 1000;
      if (varianceQuantity === 0) continue; // الرصيد مطابق - مفيش سطر يتسجل

      const varianceValue = l.unitCost !== null ? Math.round(varianceQuantity * l.unitCost * 100) / 100 : null;
      const chargeAccountCode = varianceValue !== null && varianceValue !== 0 ? l.chargeAccountCode ?? DEFAULT_VARIANCE_CHARGE_ACCOUNT_CODE : null;

      lines.push({
        id: randomUUID(),
        inventoryItemId: l.inventoryItemId,
        systemQuantity: l.systemQuantity,
        actualQuantity: l.actualQuantity,
        varianceQuantity,
        unitCost: l.unitCost,
        varianceValue,
        reason: l.reason ?? null,
        chargeAccountCode,
        inventoryMovementId: null,
      });
      totalVarianceValue += varianceValue ?? 0;
    }

    return new Stocktake(randomUUID(), {
      branchId: input.branchId,
      createdBy: input.createdBy ?? null,
      notes: input.notes ?? null,
      lines,
      totalVarianceValue: Math.round(totalVarianceValue * 100) / 100,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: StocktakeProps): Stocktake {
    return new Stocktake(id, props);
  }

  assignMovementToLine(lineId: string, movementId: string): void {
    const line = this.props.lines.find((l) => l.id === lineId);
    if (line) line.inventoryMovementId = movementId;
  }

  get branchId(): string { return this.props.branchId; }
  get createdBy(): string | null { return this.props.createdBy; }
  get notes(): string | null { return this.props.notes; }
  get lines(): readonly StocktakeLine[] { return this.props.lines; }
  get totalVarianceValue(): number { return this.props.totalVarianceValue; }
  get createdAt(): Date { return this.props.createdAt; }
}
