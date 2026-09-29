export interface StorefrontBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
  supportsDineIn: boolean;
}

export interface StorefrontVariant {
  id: string;
  label: string;
  price: number;
}

export interface StorefrontModifier {
  id: string;
  name: string;
  prices: Record<string, number>;
}

export interface StorefrontItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  variants: StorefrontVariant[];
  modifiers: StorefrontModifier[];
}

export interface StorefrontCategory {
  id: string | null;
  name: string;
  items: StorefrontItem[];
}

export interface StorefrontCombo {
  id: string;
  name: string;
  price: number;
  items: { itemName: string; variantLabel: string; quantity: number }[];
}

export interface StorefrontMenu {
  orderingEnabled: boolean;
  paymentMethods: { key: string; label: string }[];
  branches: StorefrontBranch[];
  categories: StorefrontCategory[];
  combos: StorefrontCombo[];
}

export interface TrackedOrder {
  id: string;
  trackingToken: string;
  source: string;
  orderType: string;
  status: string;
  kitchenStatus: string;
  customerName: string | null;
  addressDetails: string | null;
  tableNumber: string | null;
  customerNotes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  kitchenAcceptedAt: string | null;
  kitchenReadyAt: string | null;
  branch: { name: string; phone: string | null } | null;
  lines: { name: string; variantLabel: string | null; quantity: number; lineTotal: number; modifiers: string[] }[];
  rated: boolean;
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: "توصيل",
  takeaway: "استلام من الفرع",
  dinein: "في الصالة",
};

export function money(value: number): string {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}
