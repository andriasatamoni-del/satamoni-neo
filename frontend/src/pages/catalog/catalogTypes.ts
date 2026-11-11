import { ApiError } from "../../shared/api/client";

export interface MenuCategory {
  id: string;
  name: string;
  menuGroup: string;
  displayOrder: number;
  isActive: boolean;
  isArchived: boolean;
}

export type MenuItemKind = "item" | "addon";

export const MENU_ITEM_KIND_LABELS: Record<MenuItemKind, string> = { item: "صنف عادي", addon: "إضافة" };

export interface MenuItemVariant { id: string; label: string; price: number; talabatPrice: number; }

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

export interface Combo {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  imageUrl: string | null;
  description: string | null;
  onlineOnly: boolean;
  items: ComboItem[];
}

export interface PriceHistoryTarget { itemId: string; variantId: string; label: string; }

export const ADDON_VARIANT_LABEL = "عادي";

export function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "حصل خطأ غير متوقع";
}
