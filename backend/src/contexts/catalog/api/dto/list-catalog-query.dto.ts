import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, QueryBoolean } from "../../../../shared/http/list-query.dto";
import { MENU_GROUPS } from "../../domain/menu-category.aggregate";

export class ListMenuItemsQueryDto extends ListQueryDto {
  /** a category id, or `none` for items without a category */
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
  // ?archived=true بيرجّع الأقسام المؤرشفة بس (قائمة الاسترجاع في الإعدادات)؛ الافتراضي غير المؤرشفة
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
