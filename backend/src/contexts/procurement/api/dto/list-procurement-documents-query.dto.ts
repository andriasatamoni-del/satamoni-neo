import { IsIn, IsOptional, IsString } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { PURCHASE_ORDER_STATUSES } from "../../domain/purchase-order.aggregate";
import { GOODS_RECEIPT_STATUSES } from "../../domain/goods-receipt.aggregate";

export class ListPurchaseOrdersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class ListGoodsReceiptsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(GOODS_RECEIPT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
