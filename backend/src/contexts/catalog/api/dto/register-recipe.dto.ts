import { IsIn, IsOptional, IsUUID } from "class-validator";
import { RECIPE_TYPES } from "../../domain/recipe.aggregate";

export class RegisterRecipeDto {
  @IsIn(RECIPE_TYPES)
  recipeType!: string;

  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() inventoryItemId?: string;
}
