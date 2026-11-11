import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { offlineFallbackQuery } from "./offlineFallbackQuery";
import type { CatalogLayout, Combo, MenuCategory, MenuItem, OrderLine } from "./posTypes";

const NO_CATEGORIES: MenuCategory[] = [];
const NO_ITEMS: MenuItem[] = [];
const NO_COMBOS: Combo[] = [];

export interface PosCatalog {
  categories: MenuCategory[];
  items: MenuItem[];
  addons: MenuItem[];
  combos: Combo[];
  combosPosition: number;
  describeOrderLine: (line: OrderLine) => string;
}

export function usePosCatalog(enabled: boolean): PosCatalog {
  const categoriesQuery = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => offlineFallbackQuery<MenuCategory[]>("/catalog/categories", "catalog-categories"),
    enabled,
  });
  const layoutQuery = useQuery({
    queryKey: ["catalog", "layout"],
    queryFn: () => offlineFallbackQuery<CatalogLayout>("/catalog/layout", "catalog-layout"),
    enabled,
  });
  const menuItemsQuery = useQuery({
    queryKey: ["catalog", "items"],
    queryFn: () => offlineFallbackQuery<MenuItem[]>("/catalog/items", "catalog-items"),
    enabled,
  });
  const addonsQuery = useQuery({
    queryKey: ["catalog", "items", "addons"],
    queryFn: () => offlineFallbackQuery<MenuItem[]>("/catalog/items?kind=addon", "catalog-addons"),
    enabled,
  });
  const combosQuery = useQuery({
    queryKey: ["catalog", "combos"],
    queryFn: () => offlineFallbackQuery<Combo[]>("/catalog/combos", "catalog-combos"),
    enabled,
  });

  const items = menuItemsQuery.data ?? NO_ITEMS;
  const addonRows = addonsQuery.data ?? NO_ITEMS;
  const addons = useMemo(() => addonRows.filter((a) => a.kind === "addon"), [addonRows]);
  const allCombos = combosQuery.data ?? NO_COMBOS;
  const posCombos = useMemo(() => allCombos.filter((c) => !c.onlineOnly), [allCombos]);

  const describeOrderLine = useCallback(
    (line: OrderLine) => {
      if (line.comboId) return allCombos.find((c) => c.id === line.comboId)?.name ?? "عرض";
      const item = items.find((i) => i.variants.some((v) => v.id === line.variantId));
      const variant = item?.variants.find((v) => v.id === line.variantId);
      const name = item && variant ? `${item.name} (${variant.label})` : line.variantId ?? "";
      if (line.addons.length === 0) return name;
      const addonNames = line.addons.map((a) => {
        const addonName = addons.find((addon) => addon.id === a.menuItemId)?.name ?? "إضافة";
        return a.quantity > line.quantity ? `${addonName} ×${a.quantity / line.quantity}` : addonName;
      });
      return `${name} + ${addonNames.join(" + ")}`;
    },
    [allCombos, items, addons]
  );

  return {
    categories: categoriesQuery.data ?? NO_CATEGORIES,
    items,
    addons,
    combos: posCombos,
    combosPosition: layoutQuery.data?.combosPosition ?? -1,
    describeOrderLine,
  };
}
