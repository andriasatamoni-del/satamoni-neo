import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { WAGE_TYPES } from "../../domain/employee.aggregate";

export class RegisterEmployeeDto {
  @IsString()
  name!: string;

  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsNumber() baseSalary?: number;
  @IsOptional() @IsIn(WAGE_TYPES) wageType?: string;
  @IsOptional() @IsNumber() hourlyRate?: number;
  @IsOptional() @IsNumber() workingDaysPerMonth?: number;
  @IsOptional() @IsString() shift?: string;
  @IsOptional() @IsUUID() restrictedBranchId?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() notes?: string;
}
