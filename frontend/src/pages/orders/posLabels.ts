import type { MenuGroup } from "./posTypes";

export const SOURCE_LABELS: Record<string, string> = { website: "أونلاين", whatsapp: "واتساب", talabat: "طلبات" };

export const STATUS_LABELS: Record<string, string> = {
  preparing: "بيتحضّر", out_for_delivery: "في الطريق", completed: "مكتمل", cancelled: "ملغي",
};

export const ORDER_TYPES = [
  { value: "takeaway", label: "تيك أواي" },
  { value: "dinein", label: "صالة" },
  { value: "delivery", label: "دليفري" },
];

export const MENU_GROUP_LABELS: Record<MenuGroup, string> = { regular: "عادي", fasting: "صيامي" };

export function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}

export function orderTypeLabel(orderType: string): string {
  return ORDER_TYPES.find((t) => t.value === orderType)?.label ?? orderType;
}

export function formatPrice(amount: number): string {
  return `${amount}ج`;
}
