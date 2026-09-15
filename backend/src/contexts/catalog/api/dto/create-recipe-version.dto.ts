import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export class RecipeIngredientInputDto {
  @IsUUID()
  ingredientItemId!: string;

  @IsNumber()
  quantity!: number;

  @IsOptional() @IsString() unit?: string;
}

export class CreateRecipeVersionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients!: RecipeIngredientInputDto[];
}
