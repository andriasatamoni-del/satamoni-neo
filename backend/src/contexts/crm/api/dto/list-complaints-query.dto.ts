import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListComplaintsQueryDto extends BranchListQueryDto {
  // validated by ListComplaintsHandler, which answers an unknown status with UnknownComplaintStatusError
  @IsOptional()
  @IsString()
  status?: string;
}
