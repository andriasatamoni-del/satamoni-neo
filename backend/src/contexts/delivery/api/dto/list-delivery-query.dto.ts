import { IsIn, IsOptional, IsString } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { DRIVER_STATUSES } from "../../domain/driver.aggregate";
import { DISPATCH_STATUSES } from "../../domain/delivery-assignment.aggregate";

export class ListDriversQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(DRIVER_STATUSES)
  status?: string;
}

export class ListDeliveryAssignmentsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsIn(DISPATCH_STATUSES)
  status?: string;
}

export class ListDriverSettlementsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  varianceStatus?: string;
}

export class ListDriverAttendanceShiftsQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
