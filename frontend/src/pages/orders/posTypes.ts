export interface Branch { id: string; name: string; }
export type MenuGroup = "regular" | "fasting";
export interface MenuCategory { id: string; name: string; displayOrder: number; menuGroup: MenuGroup; isActive: boolean; }
export type PriceMenu = "regular" | "talabat";
export interface MenuItemVariant { id: string; label: string; price: number; talabatPrice: number; }
export type MenuItemKind = "item" | "addon";
export interface MenuItem {
  id: string;
  kind: MenuItemKind;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
}
export interface ComboItem { variantId: string; quantity: number; }
export interface Combo { id: string; name: string; price: number; isActive: boolean; onlineOnly?: boolean; items: ComboItem[]; }
export interface CatalogLayout { combosPosition: number; }
export interface PaymentMethod { id: string; name: string; }

export interface OrderLineAddon {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
export interface OrderLine {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  comboId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  addons: OrderLineAddon[];
}
export interface Order {
  id: string;
  branchId: string;
  orderType: string;
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: OrderLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  kitchenStatus: string;
  paymentMethodId: string | null;
  source?: string;
  customerNotes?: string | null;
  addressDetails?: string | null;
}

export interface CartLineAddon { variantId: string; name: string; quantity: number; unitPrice: number; }
export interface CartLine {
  key: string;
  variantId: string | null;
  comboId: string | null;
  itemName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  addons: CartLineAddon[];
}
