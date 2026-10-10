import type { MenuCategory } from "../menu-category.aggregate";

export interface MenuCategoryRepositoryPort {
  save(category: MenuCategory): Promise<void>;
  findById(id: string): Promise<MenuCategory | null>;
  findByLegacyCategoryId(legacyId: number): Promise<MenuCategory | null>;
  // archived: undefined = الكل (للمستهلكين القدام زي الطباعة)، false = غير المؤرشف، true = المؤرشف بس
  list(opts?: { archived?: boolean }): Promise<MenuCategory[]>;
}

export const MENU_CATEGORY_REPOSITORY = Symbol("MENU_CATEGORY_REPOSITORY");

// ترتيب عرض تبويب "العروض" وسط الأقسام (catalog_layout.combos_position). مفيش قيمة = الأول.
export interface CatalogLayoutRepositoryPort {
  getCombosPosition(): Promise<number | null>;
  setCombosPosition(position: number): Promise<void>;
}

export const CATALOG_LAYOUT_REPOSITORY = Symbol("CATALOG_LAYOUT_REPOSITORY");
