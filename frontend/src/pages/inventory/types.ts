export const ITEM_TYPES = [
  { value: "raw", label: "خام" },
  { value: "manufactured", label: "مصنّع" },
] as const;

export const UNITS = ["كيلو", "جرام", "لتر", "مللي", "قطعة", "علبة", "كيس", "كرتونة"] as const;

export type ItemType = (typeof ITEM_TYPES)[number]["value"];

export function itemTypeLabel(type: string): string {
  return ITEM_TYPES.find((t) => t.value === type)?.label ?? type;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
  itemType: ItemType;
  negativeStockPolicy: "STRICT" | "ALLOW_WITH_APPROVAL";
}

export interface BranchStockRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  itemType: ItemType;
  quantity: number;
}

export interface Branch {
  id: string;
  name: string;
}

export function formatQuantity(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "حصل خطأ غير متوقع";
}
