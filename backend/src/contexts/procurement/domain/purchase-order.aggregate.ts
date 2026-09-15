import { randomUUID } from "node:crypto";
import {
  EmptyPurchaseOrderError,
  PurchaseOrderNotEditableError,
  UnknownPurchaseOrderStatusError,
} from "./errors";

// نسخة مبسّطة من دورة حياة أمر الشراء في الريبو القديم - مؤجّل تتبّع "استلام جزئي" (PARTIALLY_RECEIVED)
// لسلايس تاني، الأولوية إثبات النمط الأساسي (Supplier + PurchaseOrder + GoodsReceipt PO-less أو مربوطة)
export const PURCHASE_ORDER_STATUSES = ["DRAFT", "SENT", "RECEIVED", "CANCELLED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

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

  cancel(): void {
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
