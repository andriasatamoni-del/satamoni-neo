import { IsIn, IsOptional, IsUUID } from "class-validator";
import { ListQueryDto } from "../../../../shared/http/list-query.dto";
import { ITEM_TYPES } from "../../domain/inventory-item.aggregate";

export class ListBranchStockQueryDto extends ListQueryDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsIn(ITEM_TYPES)
  itemType?: string;
}
