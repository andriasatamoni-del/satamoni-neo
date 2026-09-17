import { randomUUID } from "node:crypto";
import {
  EmptyPurchaseReturnError,
  InvalidPurchaseReturnLineError,
  PurchaseReturnReasonRequiredError,
  PurchaseReturnNotPostableError,
  PurchaseReturnNotCancellableError,
} from "./errors";

export const PURCHASE_RETURN_STATUSES = ["DRAFT", "POSTED", "CANCELLED"] as const;
export type PurchaseReturnStatus = (typeof PURCHASE_RETURN_STATUSES)[number];

export interface PurchaseReturnLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  lineValue: number | null;
}

export interface PurchaseReturnProps {
  branchId: string;
  supplierId: string | null;
  goodsReceiptId: string | null;
  reason: string;
  notes: string | null;
  lines: PurchaseReturnLine[];
  totalValue: number | null;
  status: PurchaseReturnStatus;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: Date;
  postedBy: string | null;
  postedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
}

// PurchaseReturn - رجوع بضاعة اتستلمت فعلًا للمورد (تالفة/غلط/منتهية) بعد GRN، مستقل تمامًا عن تعديل
// GRN/PO الأصلي (goods_receipt_id للتتبع بس). مفيش تتبّع دفعات (batch/FEFO) هنا زي الريبو القديم -
// Inventory context في المشروع ده أصلًا مالوش مفهوم batch، فتكلفة كل بند بتتحدد من unit_cost صريح أو
// من inventory_items.unit_cost وقت التسجيل - تبسيط متعمّد موثّق (راجع migration 017). لما التكلفة متوفرة
// لكل البنود بيترحّل قيد محاسبي عكسي لقيد الاستلام الأصلي (DR AP / CR المخزون)؛ POSTED نهائية زي الريبو
// القديم بالظبط ("البضاعة خرجت فعليًا للمورد") - مفيش إلغاء بعد الترحيل
export class PurchaseReturn {
  private constructor(
    public readonly id: string,
    private props: PurchaseReturnProps
  ) {}

  static register(input: {
    branchId: string;
    supplierId?: string | null;
    goodsReceiptId?: string | null;
    reason: string;
    notes?: string | null;
    createdBy?: string | null;
    lines: { inventoryItemId: string; quantity: number; unit: string; unitCost: number | null }[];
  }): PurchaseReturn {
    if (input.lines.length === 0) throw new EmptyPurchaseReturnError();
    for (const l of input.lines) {
      if (!l.inventoryItemId || !(l.quantity > 0) || !l.unit) throw new InvalidPurchaseReturnLineError();
    }
    if (!input.reason || !input.reason.trim()) throw new PurchaseReturnReasonRequiredError();

    const lines: PurchaseReturnLine[] = input.lines.map((l) => ({
      id: randomUUID(),
      inventoryItemId: l.inventoryItemId,
      quantity: l.quantity,
      unit: l.unit,
      unitCost: l.unitCost,
      lineValue: l.unitCost === null ? null : l.unitCost * l.quantity,
    }));
    const totalValue = lines.some((l) => l.lineValue === null) ? null : lines.reduce((sum, l) => sum + (l.lineValue ?? 0), 0);

    const now = new Date();
    return new PurchaseReturn(randomUUID(), {
      branchId: input.branchId,
      supplierId: input.supplierId ?? null,
      goodsReceiptId: input.goodsReceiptId ?? null,
      reason: input.reason,
      notes: input.notes ?? null,
      lines,
      totalValue,
      status: "DRAFT",
      journalEntryId: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      postedBy: null,
      postedAt: null,
      cancelledBy: null,
      cancelledAt: null,
    });
  }

  static reconstitute(id: string, props: PurchaseReturnProps): PurchaseReturn {
    return new PurchaseReturn(id, props);
  }

  // بيرجّع true لو اترحّلت فعلًا دلوقتي، false لو كانت متسجّلة POSTED بالفعل (idempotent - نفس فلسفة
  // الريبو القديم "duplicate: true" بدل ما يرمي error)
  post(input: { postedBy: string | null }): boolean {
    if (this.props.status === "POSTED") return false;
    if (this.props.status !== "DRAFT") throw new PurchaseReturnNotPostableError();
    this.props.status = "POSTED";
    this.props.postedBy = input.postedBy;
    this.props.postedAt = new Date();
    return true;
  }

  assignJournalEntry(journalEntryId: string): void {
    this.props.journalEntryId = journalEntryId;
  }

  cancel(input: { cancelledBy: string | null }): void {
    if (this.props.status !== "DRAFT") throw new PurchaseReturnNotCancellableError();
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy;
    this.props.cancelledAt = new Date();
  }

  get branchId(): string { return this.props.branchId; }
  get supplierId(): string | null { return this.props.supplierId; }
  get goodsReceiptId(): string | null { return this.props.goodsReceiptId; }
  get reason(): string { return this.props.reason; }
  get notes(): string | null { return this.props.notes; }
  get lines(): readonly PurchaseReturnLine[] { return this.props.lines; }
  get totalValue(): number | null { return this.props.totalValue; }
  get status(): PurchaseReturnStatus { return this.props.status; }
  get journalEntryId(): string | null { return this.props.journalEntryId; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get postedBy(): string | null { return this.props.postedBy; }
  get postedAt(): Date | null { return this.props.postedAt; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
}
