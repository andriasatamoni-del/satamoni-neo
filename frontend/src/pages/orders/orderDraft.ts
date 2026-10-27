import { useState } from "react";
import type { PosCustomer } from "./posCustomer";
import type { CartLine } from "./posTypes";

export interface OrderDraft {
  orderType: string;
  tableNumber: string;
  customer: PosCustomer | null;
  customerAddressId: string;
  customerName: string;
  customerPhone: string;
  addressDetails: string;
  discount: string;
  paymentMethodId: string;
}

const EMPTY_DRAFT: OrderDraft = {
  orderType: "takeaway",
  tableNumber: "",
  customer: null,
  customerAddressId: "",
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

export function takesCustomer(orderType: string): boolean {
  return orderType === "takeaway" || orderType === "delivery";
}

export function missingCustomerDetails(draft: OrderDraft): string | null {
  if (draft.orderType !== "delivery") return null;
  if (draft.customer) return draft.customerAddressId ? null : "اختار عنوان التوصيل للعميل";
  return draft.customerName.trim() || draft.customerPhone.trim() || draft.addressDetails.trim() ? null : "اختار العميل للدليفري";
}

function customerFields(draft: OrderDraft) {
  if (!takesCustomer(draft.orderType)) return {};
  const isDelivery = draft.orderType === "delivery";
  if (draft.customer) {
    return {
      customerId: draft.customer.id,
      customerPhone: draft.customerPhone || undefined,
      customerAddressId: isDelivery && draft.customerAddressId ? draft.customerAddressId : undefined,
    };
  }
  return {
    customerName: draft.customerName || undefined,
    customerPhone: draft.customerPhone || undefined,
    addressDetails: isDelivery && draft.addressDetails ? draft.addressDetails : undefined,
  };
}

export function buildOrderPayload(branchId: string, draft: OrderDraft, lines: CartLine[]) {
  const discount = discountAmount(draft);
  return {
    branchId,
    orderType: draft.orderType,
    tableNumber: draft.orderType === "dinein" && draft.tableNumber ? draft.tableNumber : undefined,
    ...customerFields(draft),
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
