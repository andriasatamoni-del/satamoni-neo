export interface Branch { id: string; name: string; }
export type MenuGroup = "regular" | "fasting";
export interface MenuCategory { id: string; name: string; displayOrder: number; menuGroup: MenuGroup; isActive: boolean; }
export interface MenuItemVariant { id: string; label: string; price: number; talabatPrice: number | null; }
export interface MenuItemModifierVariantPrice { variantId: string; priceDelta: number; }
export interface MenuItemModifier {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  variantPrices: MenuItemModifierVariantPrice[];
}
export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
  modifiers: MenuItemModifier[];
}
export interface ComboItem { variantId: string; quantity: number; }
export interface Combo { id: string; name: string; price: number; isActive: boolean; onlineOnly?: boolean; items: ComboItem[]; }
export interface CatalogLayout { combosPosition: number; }
export interface PaymentMethod { id: string; name: string; }

export interface OrderLineModifier { modifierId: string | null; nameAtSale: string; priceAtSale: number; }
export interface OrderLine {
  menuItemId: string | null;
  variantId: string | null;
  comboId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: OrderLineModifier[];
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

export interface CartLineModifier { modifierId: string; name: string; priceDelta: number; }
export interface CartLine {
  key: string;
  variantId: string | null;
  comboId: string | null;
  itemName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  modifiers: CartLineModifier[];
}
