import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { ListQueryDto } from "../../../../shared/http/list-query.dto";
import { EMPLOYEE_STATUSES } from "../../domain/employee.aggregate";
import { PAYROLL_RUN_STATUSES } from "../../domain/payroll-run.aggregate";
import { LEAVE_REQUEST_STATUSES } from "../../domain/leave-request.aggregate";

export class ListEmployeesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class ListPayrollRunsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(PAYROLL_RUN_STATUSES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class ListLeaveRequestsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(LEAVE_REQUEST_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class ListDepartmentsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListPositionsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class ListPayrollAdjustmentsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
