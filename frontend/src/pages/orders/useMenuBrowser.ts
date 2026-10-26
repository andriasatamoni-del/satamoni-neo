import { useMemo, useState } from "react";
import type { MenuGroup } from "./posTypes";
import type { PosCatalog } from "./usePosCatalog";

export const MENU_GROUP_FILTERS: readonly MenuGroup[] = ["regular", "fasting"];
const DEFAULT_MENU_GROUP: MenuGroup = "regular";

export const COMBOS_TAB = "combos";
export const UNCATEGORIZED_TAB = "none";

export interface MenuTab { key: string; label: string; order: number; rank: number; }

export function useMenuBrowser({ categories, items, combos, combosPosition }: PosCatalog) {
  const [selectedMenuGroup, setSelectedMenuGroup] = useState<MenuGroup>(DEFAULT_MENU_GROUP);

  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const hasFastingMenu = categories.some((c) => c.menuGroup === "fasting");
  const menuGroup = hasFastingMenu ? selectedMenuGroup : DEFAULT_MENU_GROUP;

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive && c.menuGroup === menuGroup),
    [categories, menuGroup]
  );

  const sellableItems = useMemo(() => {
    const activeCategoryIds = new Set(activeCategories.map((c) => c.id));
    return items.filter((item) => {
      if (!item.isActive) return false;
      if (item.categoryId === null) return menuGroup === DEFAULT_MENU_GROUP;
      return activeCategoryIds.has(item.categoryId);
    });
  }, [items, activeCategories, menuGroup]);
  const hasUncategorized = sellableItems.some((i) => i.categoryId === null);

  const tabs = useMemo(() => {
    const list: MenuTab[] = activeCategories.map((c) => ({ key: c.id, label: c.name, order: c.displayOrder, rank: 1 }));
    if (combos.length > 0) list.push({ key: COMBOS_TAB, label: "العروض", order: combosPosition, rank: 0 });
    if (hasUncategorized) list.push({ key: UNCATEGORIZED_TAB, label: "بدون قسم", order: Number.MAX_SAFE_INTEGER, rank: 2 });
    return list.sort((a, b) => a.order - b.order || a.rank - b.rank || a.label.localeCompare(b.label, "ar"));
  }, [activeCategories, combos.length, combosPosition, hasUncategorized]);

  const activeTab = tabs.some((t) => t.key === selectedTab) ? selectedTab : tabs[0]?.key ?? null;
  const searchTerm = search.trim().toLowerCase();
  const searching = searchTerm !== "";
  const showingCombos = activeTab === COMBOS_TAB && !searching;

  const visibleItems = useMemo(() => {
    if (searching) return sellableItems.filter((item) => item.name.toLowerCase().includes(searchTerm));
    if (!activeTab || activeTab === COMBOS_TAB) return [];
    return sellableItems.filter((item) => (activeTab === UNCATEGORIZED_TAB ? item.categoryId === null : item.categoryId === activeTab));
  }, [sellableItems, activeTab, searching, searchTerm]);

  return {
    menuGroup,
    selectMenuGroup: (group: MenuGroup) => { setSelectedMenuGroup(group); setSelectedTab(null); },
    hasFastingMenu,
    search,
    setSearch,
    searching,
    tabs,
    activeTab,
    selectTab: (key: string) => { setSelectedTab(key); setSearch(""); },
    showingCombos,
    visibleItems,
  };
}
