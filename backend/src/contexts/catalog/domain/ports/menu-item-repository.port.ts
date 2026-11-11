import type { MenuItem, MenuItemKind } from "../menu-item.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

export interface MenuItemListFilter {
  q?: string;
  kind?: MenuItemKind;
  categoryId?: string;
  status?: "active" | "inactive";
  isBest?: boolean;
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface MenuItemRepositoryPort {
  save(item: MenuItem): Promise<void>;
  findById(id: string): Promise<MenuItem | null>;
  findByVariantId(variantId: string): Promise<MenuItem | null>;
  findByLegacyMenuItemId(legacyId: number): Promise<MenuItem | null>;
  list(kind?: MenuItemKind): Promise<MenuItem[]>;
  search(filter: MenuItemListFilter, page?: PageRequest): Promise<{ items: MenuItem[]; total: number }>;
}

export const MENU_ITEM_REPOSITORY = Symbol("MENU_ITEM_REPOSITORY");
