import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListPrintJobsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}
