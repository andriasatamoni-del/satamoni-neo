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
  const combosQuery = useQuery({
    queryKey: ["catalog", "combos"],
    queryFn: () => offlineFallbackQuery<Combo[]>("/catalog/combos", "catalog-combos"),
    enabled,
  });

  const items = menuItemsQuery.data ?? NO_ITEMS;
  const allCombos = combosQuery.data ?? NO_COMBOS;
  const posCombos = useMemo(() => allCombos.filter((c) => !c.onlineOnly), [allCombos]);

  const describeOrderLine = useCallback(
    (line: OrderLine) => {
      if (line.comboId) return allCombos.find((c) => c.id === line.comboId)?.name ?? "عرض";
      for (const item of items) {
        const variant = item.variants.find((v) => v.id === line.variantId);
        if (variant) return `${item.name} (${variant.label})`;
      }
      return line.variantId ?? "";
    },
    [allCombos, items]
  );

  return {
    categories: categoriesQuery.data ?? NO_CATEGORIES,
    items,
    combos: posCombos,
    combosPosition: layoutQuery.data?.combosPosition ?? -1,
    describeOrderLine,
  };
}
