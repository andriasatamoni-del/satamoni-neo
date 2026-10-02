import type { PurchaseOrder } from "./purchase-order.aggregate";
import type { GoodsReceipt } from "./goods-receipt.aggregate";
import { GoodsReceiptExceedsOrderedQuantityError, GoodsReceiptItemNotOnPurchaseOrderError } from "./errors";

const EPSILON = 0.0000001;

// Total quantity already received per item across the CONFIRMED receipts of a purchase order (excluding `exceptReceiptId`)
export function confirmedReceivedByItem(receipts: readonly GoodsReceipt[], exceptReceiptId?: string): Map<string, number> {
  const received = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.status !== "CONFIRMED" || receipt.id === exceptReceiptId) continue;
    for (const line of receipt.lines) received.set(line.inventoryItemId, (received.get(line.inventoryItemId) ?? 0) + line.quantity);
  }
  return received;
}

// BL / Phase 3.1: cumulative received quantity may never exceed the ordered quantity, and a receipt may only contain
// items that are on the purchase order. Called at registration AND (authoritatively, under the PO row lock) at confirmation.
export function assertWithinOrderedQuantity(
  order: PurchaseOrder,
  alreadyReceived: ReadonlyMap<string, number>,
  incoming: readonly { inventoryItemId: string; quantity: number }[]
): void {
  const ordered = new Map<string, number>();
  for (const line of order.lines) ordered.set(line.inventoryItemId, (ordered.get(line.inventoryItemId) ?? 0) + line.quantity);

  const requested = new Map<string, number>();
  for (const line of incoming) requested.set(line.inventoryItemId, (requested.get(line.inventoryItemId) ?? 0) + line.quantity);

  for (const [itemId, qty] of requested) {
    const orderedQty = ordered.get(itemId);
    if (orderedQty === undefined) throw new GoodsReceiptItemNotOnPurchaseOrderError(itemId);
    const before = alreadyReceived.get(itemId) ?? 0;
    if (before + qty > orderedQty + EPSILON) throw new GoodsReceiptExceedsOrderedQuantityError(itemId, orderedQty, before, qty);
  }
}
