import type { Generated } from "kysely";

export interface MenuCategoriesTable {
  id: Generated<string>;
  name: string;
  display_order: number;
  menu_group: string;
  is_active: boolean;
  legacy_category_id: number | null;
  station_id: string | null;
}

export interface MenuItemsTable {
  id: Generated<string>;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  is_best: boolean;
  is_active: boolean;
  legacy_menu_item_id: number | null;
  station_id: string | null;
  created_at: Generated<Date>;
}

export interface MenuItemVariantsTable {
  id: Generated<string>;
  item_id: string;
  label: string;
  price: number;
  talabat_price: number | null;
  legacy_variant_id: number | null;
}

export interface RecipesTable {
  id: Generated<string>;
  recipe_type: string;
  variant_id: string | null;
  inventory_item_id: string | null;
  legacy_recipe_id: number | null;
  created_at: Generated<Date>;
}

export interface RecipeVersionsTable {
  id: Generated<string>;
  recipe_id: string;
  version_number: number;
  status: string;
  created_by: string | null;
  created_at: Generated<Date>;
  activated_at: Date | null;
  archived_at: Date | null;
}

export interface RecipeIngredientsTable {
  id: Generated<string>;
  recipe_version_id: string;
  ingredient_item_id: string;
  quantity: number;
  unit: string | null;
}
