import { IsOptional, IsString } from "class-validator";
import { BranchListQueryDto, ListQueryDto } from "../../../../shared/http/list-query.dto";

export class ListStocktakesQueryDto extends BranchListQueryDto {

}

export class ListTransferRequestsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  fromBranchId?: string;

  @IsOptional()
  @IsString()
  toBranchId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
