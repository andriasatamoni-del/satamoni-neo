import { Inject, Injectable } from "@nestjs/common";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import { PurchaseOrderNotFoundError } from "../../domain/errors";

export interface PurchaseOrderReceiptProgressLine {
  inventoryItemId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
}

// المطلوب/المستلم/المتبقي لكل صنف في أمر الشراء - المستلم = مجموع أذون الاستلام المؤكدة بس (المسودات
// لسه ما رحّلتش مخزون). بيستخدمه الفرونت إند عشان يقترح كميات الاستلام الجاي (المتبقي) تلقائيًا
@Injectable()
export class GetPurchaseOrderReceiptProgressHandler {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort,
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort
  ) {}

  async execute(purchaseOrderId: string): Promise<PurchaseOrderReceiptProgressLine[]> {
    const order = await this.orders.findById(purchaseOrderId);
    if (!order) throw new PurchaseOrderNotFoundError();

    const received = new Map<string, number>();
    for (const receipt of await this.receipts.list({ purchaseOrderId })) {
      if (receipt.status !== "CONFIRMED") continue;
      for (const line of receipt.lines) {
        received.set(line.inventoryItemId, (received.get(line.inventoryItemId) ?? 0) + line.quantity);
      }
    }

    const byItem = new Map<string, { ordered: number; unitPrice: number }>();
    for (const line of order.lines) {
      const current = byItem.get(line.inventoryItemId);
      byItem.set(line.inventoryItemId, {
        ordered: (current?.ordered ?? 0) + line.quantity,
        unitPrice: line.unitPrice,
      });
    }

    return [...byItem].map(([inventoryItemId, { ordered, unitPrice }]) => {
      const receivedQuantity = received.get(inventoryItemId) ?? 0;
      return {
        inventoryItemId,
        orderedQuantity: ordered,
        receivedQuantity,
        remainingQuantity: Math.max(0, ordered - receivedQuantity),
        unitPrice,
      };
    });
  }
}
