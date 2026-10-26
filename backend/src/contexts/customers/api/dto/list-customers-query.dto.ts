import { IsBoolean, IsOptional } from "class-validator";
import { ListQueryDto, QueryBoolean } from "../../../../shared/http/list-query.dto";

export class ListCustomersQueryDto extends ListQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  blocked?: boolean;
}
