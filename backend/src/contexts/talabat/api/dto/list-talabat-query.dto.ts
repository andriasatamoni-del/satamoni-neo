import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto, ListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListTalabatOrdersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListTalabatIntegrationErrorsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
