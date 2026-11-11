import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, QueryBoolean } from "../../../../shared/http/list-query.dto";
import { MENU_GROUPS } from "../../domain/menu-category.aggregate";

export const MENU_ITEM_KIND_FILTERS = ["item", "addon", "all"] as const;
export type MenuItemKindFilter = (typeof MENU_ITEM_KIND_FILTERS)[number];

export class ListMenuItemsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(MENU_ITEM_KIND_FILTERS)
  kind?: MenuItemKindFilter;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  isBest?: boolean;
}

export class ListMenuCategoriesQueryDto extends ListQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsIn(MENU_GROUPS)
  menuGroup?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
