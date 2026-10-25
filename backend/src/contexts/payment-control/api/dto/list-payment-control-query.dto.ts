import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListPaymentsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  settlementChannel?: string;
}

export class ListAdjustmentRequestsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ListReconciliationRecordsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  matchStatus?: string;
}
