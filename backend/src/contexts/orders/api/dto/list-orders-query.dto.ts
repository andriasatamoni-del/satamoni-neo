import { IsIn, IsOptional } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { ORDER_SOURCES, ORDER_STATUSES, ORDER_TYPES } from "../../domain/order.aggregate";

export class ListOrdersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(ORDER_TYPES)
  orderType?: string;

  @IsOptional()
  @IsIn(ORDER_SOURCES)
  source?: string;
}
