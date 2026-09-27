import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { WAGE_TYPES } from "../../domain/employee.aggregate";

export class UpdateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsNumber() baseSalary?: number;
  @IsOptional() @IsIn(WAGE_TYPES) wageType?: string;
  @IsOptional() @IsNumber() hourlyRate?: number;
  @IsOptional() @IsNumber() workingDaysPerMonth?: number;
  @IsOptional() @IsString() shift?: string;
  // نقل فرع (restrictedBranchId) أدمن بس - نفس قاعدة الريبو القديم بالحرف (راجع تعليق
  // update-employee.handler.ts)
  @IsOptional() @IsUUID() restrictedBranchId?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsString() reason?: string;
}
