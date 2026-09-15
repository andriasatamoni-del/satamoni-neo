import { randomUUID } from "node:crypto";
import { EmptyGoodsReceiptError, GoodsReceiptAlreadyConfirmedError } from "./errors";

export const GOODS_RECEIPT_STATUSES = ["DRAFT", "CONFIRMED"] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

export interface GoodsReceiptLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
}

export interface GoodsReceiptProps {
  purchaseOrderId: string | null;
  supplierId: string | null;
  branchId: string;
  status: GoodsReceiptStatus;
  lines: GoodsReceiptLine[];
  receivedBy: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  legacyGoodsReceiptId: number | null;
}

// GoodsReceipt - نفس مفهوم goods_receipts+goods_receipt_items في الريبو القديم، بس هنا موحّد مع مسار
// "المشترى النقدي السريع" (purchases في الريبو القديم) - أي استلام بضاعة، سواء مربوط بأمر شراء رسمي
// (purchaseOrderId) أو لأ (PO-less، زي مشترى الكاشير الطارئ)، بقى نفس الـaggregate ونفس الجدول -
// بالظبط الدمج اللي خطة إعادة البناء طلبته (bounded context map، Procurement: "the informal cashier
// purchases path modeled as a lightweight PO-less GRN instead of a separate parallel table").
// الترحيل الفعلي للمخزون بيحصل بس وقت confirm() - نفس نقطة الترحيل الوحيدة في الريبو القديم بالظبط
// (راجع ConfirmGoodsReceiptHandler اللي بيستدعي StockMovementRepositoryPort مباشرة بعد الحفظ).
export class GoodsReceipt {
  private constructor(
    public readonly id: string,
    private props: GoodsReceiptProps
  ) {}

  static register(input: {
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    branchId: string;
    lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
    receivedBy?: string | null;
    legacyGoodsReceiptId?: number | null;
  }): GoodsReceipt {
    if (input.lines.length === 0) throw new EmptyGoodsReceiptError();

    return new GoodsReceipt(randomUUID(), {
      purchaseOrderId: input.purchaseOrderId ?? null,
      supplierId: input.supplierId ?? null,
      branchId: input.branchId,
      status: "DRAFT",
      lines: input.lines.map((l) => ({ id: randomUUID(), ...l })),
      receivedBy: input.receivedBy ?? null,
      createdAt: new Date(),
      confirmedAt: null,
      legacyGoodsReceiptId: input.legacyGoodsReceiptId ?? null,
    });
  }

  static reconstitute(id: string, props: GoodsReceiptProps): GoodsReceipt {
    return new GoodsReceipt(id, props);
  }

  confirm(): void {
    if (this.props.status === "CONFIRMED") throw new GoodsReceiptAlreadyConfirmedError();
    this.props.status = "CONFIRMED";
    this.props.confirmedAt = new Date();
  }

  get purchaseOrderId(): string | null { return this.props.purchaseOrderId; }
  get supplierId(): string | null { return this.props.supplierId; }
  get branchId(): string { return this.props.branchId; }
  get status(): GoodsReceiptStatus { return this.props.status; }
  get lines(): readonly GoodsReceiptLine[] { return this.props.lines; }
  get receivedBy(): string | null { return this.props.receivedBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get confirmedAt(): Date | null { return this.props.confirmedAt; }
  get legacyGoodsReceiptId(): number | null { return this.props.legacyGoodsReceiptId; }
}
