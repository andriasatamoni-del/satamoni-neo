import { Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from "class-validator";

export class PayrollRunEmployeeInputDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional() @IsUUID() branchId?: string;

  @IsNumber()
  grossPay!: number;

  @IsOptional() @IsNumber() advances?: number;
  @IsOptional() @IsNumber() penalties?: number;
  @IsOptional() @IsNumber() bonuses?: number;
}

export class RegisterPayrollRunDto {
  @IsInt()
  year!: number;

  @IsInt() @Min(1) @Max(12)
  month!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollRunEmployeeInputDto)
  employees!: PayrollRunEmployeeInputDto[];
}
