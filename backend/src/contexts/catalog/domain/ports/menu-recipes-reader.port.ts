import type { MenuItemKind } from "../menu-item.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

export interface MenuRecipeIngredient {
  ingredientItemId: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface MenuRecipeUsage {
  itemId: string;
  itemName: string;
  variantId: string;
  label: string;
}

export interface MenuRecipe {
  id: string;
  name: string;
  activeVersion: { versionNumber: number; ingredients: MenuRecipeIngredient[] } | null;
  usedBy: MenuRecipeUsage[];
}

export interface MenuRecipeOption {
  id: string;
  name: string;
  ready: boolean;
}

export interface MenuRecipeVariant {
  id: string;
  label: string;
  recipeId: string | null;
  recipeName: string | null;
  ready: boolean;
}

export interface MenuRecipeItem {
  id: string;
  name: string;
  kind: MenuItemKind;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  awaitingRecipe: boolean;
  hasRecipe: boolean;
  variants: MenuRecipeVariant[];
}

export interface MenuRecipeItemFilter {
  q?: string;
  missing?: boolean;
  itemId?: string;
}

export interface MenuRecipesReaderPort {
  recipes(filter: { q?: string }, page?: PageRequest): Promise<{ rows: MenuRecipe[]; total: number }>;
  items(filter: MenuRecipeItemFilter, page?: PageRequest): Promise<{ rows: MenuRecipeItem[]; total: number }>;
  options(): Promise<MenuRecipeOption[]>;
}

export const MENU_RECIPES_READER = Symbol("MENU_RECIPES_READER");
