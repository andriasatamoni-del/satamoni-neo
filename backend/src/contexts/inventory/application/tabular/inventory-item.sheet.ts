import { column } from "../../../../shared/tabular/sheet/sheet-column";
import { defineSheet, type SheetRow } from "../../../../shared/tabular/sheet/sheet-definition";
import type { InventoryItem } from "../../domain/inventory-item.aggregate";

export const INVENTORY_ITEM_SHEET = defineSheet({
  name: "inventory-items",
  sheetName: "أصناف المخزون",
  key: "name",
  columns: [
    column.text("name", "اسم الصنف", { maxLength: 200 }).required().withWidth(32),
    column.text("unit", "الوحدة", { maxLength: 50 }).required().withWidth(12),
    column.number("unitCost", "تكلفة الوحدة", { min: 0 }),
    column.enumeration("itemType", "النوع", [
      { value: "raw", label: "خام" },
      { value: "manufactured", label: "مُصنّع" },
    ]),
    column.enumeration("negativeStockPolicy", "سياسة الرصيد السالب", [
      { value: "STRICT", label: "ممنوع" },
      { value: "ALLOW_WITH_APPROVAL", label: "مسموح بموافقة" },
    ]).withWidth(22),
  ],
});

export type InventoryItemSheetRow = SheetRow<typeof INVENTORY_ITEM_SHEET>;

export function inventoryItemSheetRow(item: InventoryItem): InventoryItemSheetRow {
  return {
    name: item.name,
    unit: item.unit,
    unitCost: item.unitCost === null ? null : Number(item.unitCost),
    itemType: item.itemType,
    negativeStockPolicy: item.negativeStockPolicy,
  };
}
