import type { MenuItem } from "../menu-item.aggregate";

export interface MenuItemRepositoryPort {
  save(item: MenuItem): Promise<void>;
  findById(id: string): Promise<MenuItem | null>;
  findByVariantId(variantId: string): Promise<MenuItem | null>;
  findByLegacyMenuItemId(legacyId: number): Promise<MenuItem | null>;
  list(): Promise<MenuItem[]>;
}

export const MENU_ITEM_REPOSITORY = Symbol("MENU_ITEM_REPOSITORY");
