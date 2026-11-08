import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { TabularExportQueryDto } from "../../../../shared/tabular/tabular-http";
import { ITEM_TYPES } from "../../domain/inventory-item.aggregate";

export class ExportInventoryItemsQueryDto extends TabularExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(ITEM_TYPES)
  itemType?: string;
}
