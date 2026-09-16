import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { EMPLOYEE_STATUSES } from "../../domain/employee.aggregate";

export class SetEmployeeStatusDto {
  @IsIn(EMPLOYEE_STATUSES)
  status!: string;

  @IsOptional() @IsDateString() terminationDate?: string;
  @IsOptional() @IsString() terminationReason?: string;
}
