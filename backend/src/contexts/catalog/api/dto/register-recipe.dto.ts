import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { RECIPE_TYPES } from "../../domain/recipe.aggregate";
import { RecipeIngredientInputDto } from "./create-recipe-version.dto";

export class RegisterRecipeDto {
  @IsIn(RECIPE_TYPES)
  recipeType!: string;

  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsUUID() inventoryItemId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients?: RecipeIngredientInputDto[];
}
