import { IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { MENU_GROUPS } from "../../domain/menu-category.aggregate";

export class RegisterMenuCategoryDto {
  @IsString()
  name!: string;

  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsIn(MENU_GROUPS) menuGroup?: string;
}
