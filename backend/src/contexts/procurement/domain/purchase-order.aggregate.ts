import { randomUUID } from "node:crypto";
import {
  EmptyPurchaseOrderError,
  PurchaseOrderNotCancellableError,
  PurchaseOrderNotEditableError,
  UnknownPurchaseOrderStatusError,
} from "./errors";

// دورة حياة أمر الشراء: DRAFT -> SENT -> PARTIALLY_RECEIVED -> RECEIVED (أو CANCELLED قبل أي استلام).
// حالة الاستلام بتتحسب من إجمالي الكميات المستلمة فعليًا في أذون الاستلام المؤكدة مقابل كميات البنود -
// نفس منطق routes/goods-receipts.js في الريبو القديم (FULLY_RECEIVED/PARTIALLY_RECEIVED)
export const PURCHASE_ORDER_STATUSES = ["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export const RECEIVABLE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ["SENT", "PARTIALLY_RECEIVED"];
const QUANTITY_EPSILON = 0.0000001;

export interface PurchaseOrderLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseOrderProps {
  supplierId: string;
  branchId: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  createdBy: string | null;
  createdAt: Date;
  legacyPurchaseOrderId: number | null;
}

// PurchaseOrder - نفس مفهوم purchase_orders+purchase_order_items في الريبو القديم، بس البنود entities
// تابعة لنفس aggregate (زي MenuItem.variants بالظبط)
export class PurchaseOrder {
  private constructor(
    public readonly id: string,
    private props: PurchaseOrderProps
  ) {}

  static register(input: {
    supplierId: string;
    branchId: string;
    lines: { inventoryItemId: string; quantity: number; unitPrice: number }[];
    createdBy?: string | null;
    legacyPurchaseOrderId?: number | null;
  }): PurchaseOrder {
    if (input.lines.length === 0) throw new EmptyPurchaseOrderError();

    return new PurchaseOrder(randomUUID(), {
      supplierId: input.supplierId,
      branchId: input.branchId,
      status: "DRAFT",
      lines: input.lines.map((l) => ({ id: randomUUID(), ...l })),
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      legacyPurchaseOrderId: input.legacyPurchaseOrderId ?? null,
    });
  }

  static reconstitute(id: string, props: PurchaseOrderProps): PurchaseOrder {
    return new PurchaseOrder(id, props);
  }

  markSent(): void {
    if (this.props.status !== "DRAFT") throw new PurchaseOrderNotEditableError();
    this.props.status = "SENT";
  }

  markReceived(): void {
    this.props.status = "RECEIVED";
  }

  // receivedByItem: إجمالي الكمية المستلمة لكل صنف عبر كل أذون الاستلام المؤكدة المربوطة بالأمر ده
  applyReceivedQuantities(receivedByItem: ReadonlyMap<string, number>): void {
    if (!RECEIVABLE_PURCHASE_ORDER_STATUSES.includes(this.props.status)) return;
    const orderedByItem = new Map<string, number>();
    for (const line of this.props.lines) {
      orderedByItem.set(line.inventoryItemId, (orderedByItem.get(line.inventoryItemId) ?? 0) + line.quantity);
    }
    const fullyReceived = [...orderedByItem].every(
      ([itemId, ordered]) => (receivedByItem.get(itemId) ?? 0) >= ordered - QUANTITY_EPSILON
    );
    const anyReceived = [...orderedByItem.keys()].some((itemId) => (receivedByItem.get(itemId) ?? 0) > 0);
    if (fullyReceived) this.props.status = "RECEIVED";
    else if (anyReceived) this.props.status = "PARTIALLY_RECEIVED";
  }

  cancel(): void {
    if (this.props.status === "RECEIVED" || this.props.status === "PARTIALLY_RECEIVED" || this.props.status === "CANCELLED") {
      throw new PurchaseOrderNotCancellableError();
    }
    this.props.status = "CANCELLED";
  }

  setStatus(status: string): void {
    if (!PURCHASE_ORDER_STATUSES.includes(status as PurchaseOrderStatus)) throw new UnknownPurchaseOrderStatusError(status);
    this.props.status = status as PurchaseOrderStatus;
  }

  get supplierId(): string { return this.props.supplierId; }
  get branchId(): string { return this.props.branchId; }
  get status(): PurchaseOrderStatus { return this.props.status; }
  get lines(): readonly PurchaseOrderLine[] { return this.props.lines; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get legacyPurchaseOrderId(): number | null { return this.props.legacyPurchaseOrderId; }
}
