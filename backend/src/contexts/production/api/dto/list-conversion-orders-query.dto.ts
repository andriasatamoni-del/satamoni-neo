import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto, ListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListConversionOrdersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
