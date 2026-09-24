import { randomUUID } from "node:crypto";
import { PurchaseMissingAmountOrItemsError, PurchaseNotPendingError, InvalidPurchaseLineError } from "./errors";

export const PURCHASE_STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface PurchaseLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseProps {
  branchId: string;
  businessDate: Date;
  category: string | null;
  amount: number;
  notes: string | null;
  supplierId: string | null;
  supplierDocumentNumber: string | null;
  lines: PurchaseLine[];
  status: PurchaseStatus;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  postedToInventory: boolean;
  createdAt: Date;
}

function computeLines(items: { inventoryItemId: string; quantity: number; unit?: string | null; unitPrice: number }[]): { lines: PurchaseLine[]; total: number } {
  let total = 0;
  const lines = items.map((it) => {
    if (!it.inventoryItemId || !(it.quantity > 0) || !(it.unitPrice >= 0)) throw new InvalidPurchaseLineError();
    const lineTotal = Math.round(it.quantity * it.unitPrice * 100) / 100;
    total += lineTotal;
    return { id: randomUUID(), inventoryItemId: it.inventoryItemId, quantity: it.quantity, unit: it.unit ?? null, unitPrice: it.unitPrice, lineTotal };
  });
  return { lines, total: Math.round(total * 100) / 100 };
}

// Purchase - نفس مفهوم purchases+purchase_items في الريبو القديم: مشترى نقدي طارئ (فرع أو سنتر كيتشن)
// من غير أمر شراء رسمي (PO-less) - منفصل عمدًا عن مسار Procurement الرسمي (PurchaseOrder->GoodsReceipt)
// زي ما الريبو القديم بالضبط بيفصل routes/purchases.js عن routes/purchase-orders.js. مشترى ببنود حقيقية
// (مواد خام موجودة فعلًا في الكتالوج) بترحّل مخزون+محاسبة وقت الاعتماد؛ مشترى بمبلغ حر من غير بنود
// (النمط الأقدم قبل البنود) مبيرحّلش أي حركة مخزون أو قيد محاسبي خالص - مجرد سجل/مذكرة، نفس تبسيط
// الريبو القديم بالحرف ("مبيلمسش المخزون خالص"). supplierId/supplierDocumentNumber هنا للربط/فحص
// التكرار بس (مش لترحيل حساب دائن للمورد - المشترى دايمًا نقدي محاسبيًا، فاتورة المورد الرسمية هي اللي
// بترحّل حساب دائن، مش المشترى الطارئ ده)
export class Purchase {
  private constructor(
    public readonly id: string,
    private props: PurchaseProps
  ) {}

  static register(input: {
    branchId: string;
    businessDate: Date;
    category?: string | null;
    amount?: number;
    notes?: string | null;
    supplierId?: string | null;
    supplierDocumentNumber?: string | null;
    items?: { inventoryItemId: string; quantity: number; unit?: string | null; unitPrice: number }[];
    initialStatus: "PENDING" | "CONFIRMED";
    createdBy?: string | null;
  }): Purchase {
    const hasItems = !!input.items && input.items.length > 0;
    if (!hasItems && !(input.amount && input.amount > 0)) throw new PurchaseMissingAmountOrItemsError();

    const { lines, total } = hasItems ? computeLines(input.items!) : { lines: [], total: input.amount ?? 0 };

    return new Purchase(randomUUID(), {
      branchId: input.branchId,
      businessDate: input.businessDate,
      category: input.category ?? (hasItems ? "مواد خام" : null),
      amount: total,
      notes: input.notes ?? null,
      supplierId: input.supplierId ?? null,
      supplierDocumentNumber: input.supplierDocumentNumber ?? null,
      lines,
      status: input.initialStatus,
      createdBy: input.createdBy ?? null,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      postedToInventory: false,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: PurchaseProps): Purchase {
    return new Purchase(id, props);
  }

  edit(input: { items?: { inventoryItemId: string; quantity: number; unit?: string | null; unitPrice: number }[]; notes?: string | null }): void {
    if (this.props.status !== "PENDING") throw new PurchaseNotPendingError();
    if (input.items) {
      const { lines, total } = computeLines(input.items);
      this.props.lines = lines;
      this.props.amount = total;
    }
    if (input.notes !== undefined) this.props.notes = input.notes;
  }

  confirm(input: { reviewedBy: string | null }): void {
    if (this.props.status !== "PENDING") throw new PurchaseNotPendingError();
    this.props.status = "CONFIRMED";
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
  }

  // بيتنفّذ بعد ما الـhandler يرحّل حركات المخزون الحقيقية (لو فيه بنود) - نفس فلسفة postPurchaseToInventory
  markPostedToInventory(): void {
    this.props.postedToInventory = true;
  }

  reject(input: { reviewedBy: string | null; reason?: string | null }): void {
    if (this.props.status !== "PENDING") throw new PurchaseNotPendingError();
    this.props.status = "REJECTED";
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
    this.props.rejectionReason = input.reason ?? null;
  }

  get branchId(): string { return this.props.branchId; }
  get businessDate(): Date { return this.props.businessDate; }
  get category(): string | null { return this.props.category; }
  get amount(): number { return this.props.amount; }
  get notes(): string | null { return this.props.notes; }
  get supplierId(): string | null { return this.props.supplierId; }
  get supplierDocumentNumber(): string | null { return this.props.supplierDocumentNumber; }
  get lines(): readonly PurchaseLine[] { return this.props.lines; }
  get status(): PurchaseStatus { return this.props.status; }
  get createdBy(): string | null { return this.props.createdBy; }
  get reviewedBy(): string | null { return this.props.reviewedBy; }
  get reviewedAt(): Date | null { return this.props.reviewedAt; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get postedToInventory(): boolean { return this.props.postedToInventory; }
  get createdAt(): Date { return this.props.createdAt; }
}
