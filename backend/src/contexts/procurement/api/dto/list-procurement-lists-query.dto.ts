import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto, ListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListSupplierInvoicesQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ListSupplierPaymentsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class ListPurchaseRequestsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListPurchaseReturnsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
