import { column } from "../../../../shared/tabular/sheet/sheet-column";
import { defineSheet, type SheetRow } from "../../../../shared/tabular/sheet/sheet-definition";
import type { MenuItem, MenuItemVariant } from "../../domain/menu-item.aggregate";

export const ADDON_VARIANT_LABEL = "عادي";

export const MENU_ITEM_SHEET = defineSheet({
  name: "menu-items",
  sheetName: "المنيو",
  columns: [
    column.text("name", "اسم الصنف", { maxLength: 200 }).required().withWidth(32),
    column.enumeration("kind", "النوع", [
      { value: "item", label: "صنف" },
      { value: "addon", label: "إضافة" },
    ]),
    column.text("category", "القسم", { maxLength: 200 }).withWidth(20),
    column.text("size", "الحجم", { maxLength: 100 }).withWidth(14),
    column.number("price", "السعر", { min: 0 }),
    column.number("talabatPrice", "سعر طلبات", { min: 0 }),
    column.text("description", "الوصف", { maxLength: 1000 }).withWidth(40),
    column.boolean("isActive", "نشط"),
  ],
});

export type MenuItemSheetRow = SheetRow<typeof MENU_ITEM_SHEET>;

export function menuItemSheetRows(item: MenuItem, categoryName: string | null): MenuItemSheetRow[] {
  const base = {
    name: item.name,
    kind: item.kind,
    category: item.isAddon ? null : categoryName,
    description: item.description,
    isActive: item.isActive,
  };
  if (item.variants.length === 0) return [{ ...base, size: null, price: null, talabatPrice: null }];
  return item.variants.map((variant: MenuItemVariant) => ({
    ...base,
    size: item.isAddon ? null : variant.label,
    price: Number(variant.price),
    talabatPrice: Number(variant.talabatPrice),
  }));
}
