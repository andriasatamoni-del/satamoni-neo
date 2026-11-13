export interface RemovableIngredient {
  inventoryItemId: string;
  name: string;
}

export interface VariantRemovableIngredients {
  variantId: string;
  ingredients: RemovableIngredient[];
}

export interface RemovableIngredientsReaderPort {
  byVariant(): Promise<VariantRemovableIngredients[]>;
}

export const REMOVABLE_INGREDIENTS_READER = Symbol("REMOVABLE_INGREDIENTS_READER");
