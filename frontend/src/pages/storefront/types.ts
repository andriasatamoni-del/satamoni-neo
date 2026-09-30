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
  imageUrl: string | null;
  description: string | null;
  // عرض حصري للموقع
  onlineOnly: boolean;
  items: { itemName: string; variantLabel: string; quantity: number }[];
}

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointsCost: number;
  kind: "discount" | "free_item" | "free_combo";
  targetName: string | null;
  // قيمة الهدية/الخصم بالجنيه
  value: number | null;
  affordable?: boolean;
}

export interface StorefrontMenu {
  orderingEnabled: boolean;
  loyalty: { pointsPerEgp: number; rewards: LoyaltyReward[] };
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

export function egpPerPoint(pointsPerEgp: number): number {
  return Math.round((1 / pointsPerEgp) * 100) / 100;
}

export function money(value: number): string {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}
