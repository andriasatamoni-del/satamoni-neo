import { IsOptional, IsUUID } from "class-validator";

export class AssignVariantRecipeDto {
  @IsOptional() @IsUUID() recipeId?: string | null;
}
