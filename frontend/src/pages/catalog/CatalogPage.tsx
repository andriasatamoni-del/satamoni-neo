import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useCan } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Tabs, usePermittedTabs, type TabItem } from "../../shared/ui/Tabs";
import type { MenuCategory } from "./catalogTypes";
import { CategoriesTab } from "./CategoriesTab";
import { CombosTab } from "./CombosTab";
import { MenuItemsTab } from "./MenuItemsTab";

const TABS: readonly TabItem[] = [
  { key: "items", label: "الأصناف" },
  { key: "combos", label: "العروض" },
  { key: "categories", label: "الأقسام" },
];

export function CatalogPage() {
  const canManage = useCan()(PERMISSION.CATALOG_ITEMS_MANAGE);
  const { tabs, active, setActive } = usePermittedTabs(TABS);
  const categoriesQuery = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiRequest<MenuCategory[]>("/catalog/categories") });
  const categories = categoriesQuery.data ?? [];

  return (
    <div>
      <PageHeader title="قائمة الطعام" description="الأصناف والإضافات والعروض والأقسام" />
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      {active === "items" && <MenuItemsTab canManage={canManage} categories={categories} />}
      {active === "combos" && <CombosTab canManage={canManage} />}
      {active === "categories" && <CategoriesTab canManage={canManage} categories={categories} />}
    </div>
  );
}
