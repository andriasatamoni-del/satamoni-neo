import { IsIn, IsOptional } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { SHIFT_STATUSES } from "../../domain/cashier-shift.aggregate";

export class ListShiftsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(SHIFT_STATUSES)
  status?: string;
}
