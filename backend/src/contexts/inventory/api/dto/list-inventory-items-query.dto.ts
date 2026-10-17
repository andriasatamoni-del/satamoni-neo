import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto } from "../../../../shared/http/list-query.dto";
import { ITEM_TYPES } from "../../domain/inventory-item.aggregate";

export class ListInventoryItemsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(ITEM_TYPES)
  itemType?: string;
}
