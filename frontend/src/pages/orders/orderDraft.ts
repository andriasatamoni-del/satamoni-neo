import { useState } from "react";
import type { CartLine } from "./posTypes";

export interface OrderDraft {
  orderType: string;
  tableNumber: string;
  customerName: string;
  customerPhone: string;
  addressDetails: string;
  discount: string;
  paymentMethodId: string;
}

const EMPTY_DRAFT: OrderDraft = {
  orderType: "takeaway",
  tableNumber: "",
  customerName: "",
  customerPhone: "",
  addressDetails: "",
  discount: "",
  paymentMethodId: "",
};

export function useOrderDraft() {
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);
  return {
    draft,
    update: (patch: Partial<OrderDraft>) => setDraft((current) => ({ ...current, ...patch })),
    resetKeepingOrderType: () => setDraft((current) => ({ ...EMPTY_DRAFT, orderType: current.orderType })),
  };
}

export function discountAmount(draft: OrderDraft): number {
  return Number(draft.discount) || 0;
}

export function orderTotal(subtotal: number, draft: OrderDraft): number {
  return Math.max(0, subtotal - discountAmount(draft));
}

export function buildOrderPayload(branchId: string, draft: OrderDraft, lines: CartLine[]) {
  const discount = discountAmount(draft);
  return {
    branchId,
    orderType: draft.orderType,
    tableNumber: draft.orderType === "dinein" && draft.tableNumber ? draft.tableNumber : undefined,
    customerName: draft.customerName || undefined,
    customerPhone: draft.customerPhone || undefined,
    addressDetails: draft.orderType === "delivery" && draft.addressDetails ? draft.addressDetails : undefined,
    items: lines.map((l) =>
      l.comboId
        ? { comboId: l.comboId, quantity: l.quantity }
        : {
            variantId: l.variantId,
            quantity: l.quantity,
            modifierIds: l.modifiers.length > 0 ? l.modifiers.map((m) => m.modifierId) : undefined,
          }
    ),
    discount: discount > 0 ? discount : undefined,
    paymentMethodId: draft.paymentMethodId || undefined,
    clientRequestId: crypto.randomUUID(),
  };
}

export function cartSummary(lines: CartLine[]): string {
  return lines.map((l) => `${l.itemName} × ${l.quantity}`).join("، ");
}
