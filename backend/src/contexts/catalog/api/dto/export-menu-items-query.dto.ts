import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { TabularExportQueryDto } from "../../../../shared/tabular/tabular-http";
import { MENU_ITEM_KIND_FILTERS, type MenuItemKindFilter } from "./list-catalog-query.dto";

export class ExportMenuItemsQueryDto extends TabularExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(MENU_ITEM_KIND_FILTERS)
  kind?: MenuItemKindFilter;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
