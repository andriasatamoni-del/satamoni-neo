import type { MenuCategory } from "../menu-category.aggregate";

export interface MenuCategoryRepositoryPort {
  save(category: MenuCategory): Promise<void>;
  findById(id: string): Promise<MenuCategory | null>;
  findByLegacyCategoryId(legacyId: number): Promise<MenuCategory | null>;
  list(): Promise<MenuCategory[]>;
}

export const MENU_CATEGORY_REPOSITORY = Symbol("MENU_CATEGORY_REPOSITORY");
