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

export interface StorefrontMenuItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  variants: { id: string; label: string; price: number }[];
  // السعر لكل حجم (سعر خاص بالحجم لو متحدد، وإلا السعر العام) - نفس MenuItem.resolveModifierPrice
  modifiers: { id: string; name: string; prices: Record<string, number> }[];
}

export interface StorefrontCategory {
  id: string | null;
  name: string;
  items: StorefrontMenuItem[];
}

export interface StorefrontCombo {
  id: string;
  name: string;
  price: number;
  items: { itemName: string; variantLabel: string; quantity: number }[];
}

export interface TrackedOrderLine {
  name: string;
  variantLabel: string | null;
  quantity: number;
  lineTotal: number;
  modifiers: string[];
}

export interface TrackedOrder {
  id: string;
  trackingToken: string;
  source: string;
  orderType: string;
  status: string;
  kitchenStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  addressDetails: string | null;
  tableNumber: string | null;
  customerNotes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: Date;
  kitchenAcceptedAt: Date | null;
  kitchenReadyAt: Date | null;
  branch: { name: string; phone: string | null } | null;
  lines: TrackedOrderLine[];
  rated: boolean;
}

export interface StorefrontReaderPort {
  branches(): Promise<StorefrontBranch[]>;
  categories(): Promise<StorefrontCategory[]>;
  combos(): Promise<StorefrontCombo[]>;
  cashPaymentMethodId(): Promise<string | null>;
  findOrder(orderId: string): Promise<TrackedOrder | null>;
  listOrdersByPhone(phone: string, limit: number): Promise<TrackedOrder[]>;
}

export const STOREFRONT_READER = Symbol("STOREFRONT_READER");
