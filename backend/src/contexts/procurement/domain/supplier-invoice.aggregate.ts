import { randomUUID } from "node:crypto";
import {
  EmptySupplierInvoiceError,
  InvalidSupplierInvoiceLineError,
  SupplierInvoiceNotApprovableError,
  SupplierInvoiceAlreadyCancelledError,
  SupplierInvoiceHasPaymentsError,
  SupplierInvoiceNotCancellableError,
  SupplierInvoiceNumberRequiredError,
} from "./errors";

export const SUPPLIER_INVOICE_STATUSES = [
  "MATCHED", "VARIANCE_PENDING", "APPROVED", "PARTIALLY_PAID", "PAID", "CANCELLED",
] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];

const VARIANCE_TOLERANCE = 0.01;
const CANCELLABLE_STATUSES: SupplierInvoiceStatus[] = ["MATCHED", "VARIANCE_PENDING", "APPROVED"];

export interface SupplierInvoiceLine {
  id: string;
  inventoryItemId: string;
  invoicedQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SupplierInvoiceProps {
  supplierId: string;
  branchId: string;
  goodsReceiptId: string | null;
  supplierInvoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  lines: SupplierInvoiceLine[];
  subtotal: number;
  tax: number;
  total: number;
  matchedTotal: number;
  varianceAmount: number;
  status: SupplierInvoiceStatus;
  varianceJournalEntryId: string | null;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// SupplierInvoice - نفس مفهوم فاتورة المورد في الريبو القديم (طبقة مطابقة فوق دورة GRN)، بس هنا
// بمطابقة على مستوى الاستلام كله (goodsReceiptId) مش سطر بسطر - تبسيط متعمّد (راجع migration 016).
// matchedTotal = قيمة الاستلام المرتبط كله لو موجود (بيتحسب في الـapplication layer وقت التسجيل، مش
// هنا - الدومين هنا مسؤول عن شكل/قواعد الفاتورة نفسها بس). variance = subtotal - matchedTotal، وده
// الوحيد اللي بيترحّل كقيد محاسبي (وقت approve()) - نفس فلسفة "مفيش تكرار لقيد الـAP" بالظبط.
export class SupplierInvoice {
  private constructor(
    public readonly id: string,
    private props: SupplierInvoiceProps
  ) {}

  static register(input: {
    supplierId: string;
    branchId: string;
    goodsReceiptId?: string | null;
    supplierInvoiceNumber: string;
    invoiceDate?: Date;
    dueDate?: Date | null;
    lines: { inventoryItemId: string; invoicedQuantity: number; unitPrice: number }[];
    tax?: number;
    matchedTotal?: number;
    notes?: string | null;
    createdBy?: string | null;
  }): SupplierInvoice {
    const invoiceNumber = input.supplierInvoiceNumber.trim();
    if (!invoiceNumber) throw new SupplierInvoiceNumberRequiredError();
    if (input.lines.length === 0) throw new EmptySupplierInvoiceError();

    const lines: SupplierInvoiceLine[] = input.lines.map((l) => {
      if (!l.inventoryItemId || !(l.invoicedQuantity > 0) || l.unitPrice < 0) throw new InvalidSupplierInvoiceLineError();
      return { id: randomUUID(), inventoryItemId: l.inventoryItemId, invoicedQuantity: l.invoicedQuantity, unitPrice: l.unitPrice, lineTotal: l.invoicedQuantity * l.unitPrice };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const tax = input.tax ?? 0;
    const matchedTotal = input.matchedTotal ?? 0;
    const varianceAmount = subtotal - matchedTotal;
    const now = new Date();

    return new SupplierInvoice(randomUUID(), {
      supplierId: input.supplierId,
      branchId: input.branchId,
      goodsReceiptId: input.goodsReceiptId ?? null,
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate: input.invoiceDate ?? now,
      dueDate: input.dueDate ?? null,
      lines,
      subtotal,
      tax,
      total: subtotal + tax,
      matchedTotal,
      varianceAmount,
      status: Math.abs(varianceAmount) <= VARIANCE_TOLERANCE ? "MATCHED" : "VARIANCE_PENDING",
      varianceJournalEntryId: null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
      approvedBy: null,
      approvedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: SupplierInvoiceProps): SupplierInvoice {
    return new SupplierInvoice(id, props);
  }

  // بيرجّع true لو فعلًا اتاعتمدت دلوقتي، false لو كانت معتمدة بالفعل (idempotent - نفس سلوك الريبو
  // القديم "duplicate" بدل ما يرمي error)
  approve(input: { approvedBy: string | null }): boolean {
    if (this.props.status === "APPROVED") return false;
    if (this.props.status !== "MATCHED" && this.props.status !== "VARIANCE_PENDING") throw new SupplierInvoiceNotApprovableError();

    this.props.status = "APPROVED";
    this.props.approvedBy = input.approvedBy;
    this.props.approvedAt = new Date();
    this.props.updatedAt = new Date();
    return true;
  }

  assignVarianceJournalEntry(journalEntryId: string): void {
    this.props.varianceJournalEntryId = journalEntryId;
  }

  cancel(input: { hasPayments: boolean; reason?: string | null; cancelledBy: string | null }): void {
    if (this.props.status === "CANCELLED") throw new SupplierInvoiceAlreadyCancelledError();
    if (input.hasPayments) throw new SupplierInvoiceHasPaymentsError();
    if (!CANCELLABLE_STATUSES.includes(this.props.status)) throw new SupplierInvoiceNotCancellableError();

    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy;
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = input.reason ?? null;
    this.props.updatedAt = new Date();
  }

  // بيتنادى بعد ما سداد يتسجّل عليها - الحالة النهائية (PARTIALLY_PAID/PAID) بتتحسب في الـapplication
  // layer (بيحتاج مجموع كل السدادات، مش بس السداد الحالي) وتتمرّر هنا جاهزة
  applyPaymentStatus(status: "PARTIALLY_PAID" | "PAID"): void {
    this.props.status = status;
    this.props.updatedAt = new Date();
  }

  get supplierId(): string { return this.props.supplierId; }
  get branchId(): string { return this.props.branchId; }
  get goodsReceiptId(): string | null { return this.props.goodsReceiptId; }
  get supplierInvoiceNumber(): string { return this.props.supplierInvoiceNumber; }
  get invoiceDate(): Date { return this.props.invoiceDate; }
  get dueDate(): Date | null { return this.props.dueDate; }
  get lines(): readonly SupplierInvoiceLine[] { return this.props.lines; }
  get subtotal(): number { return this.props.subtotal; }
  get tax(): number { return this.props.tax; }
  get total(): number { return this.props.total; }
  get matchedTotal(): number { return this.props.matchedTotal; }
  get varianceAmount(): number { return this.props.varianceAmount; }
  get status(): SupplierInvoiceStatus { return this.props.status; }
  get varianceJournalEntryId(): string | null { return this.props.varianceJournalEntryId; }
  get notes(): string | null { return this.props.notes; }
  get createdBy(): string | null { return this.props.createdBy; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
