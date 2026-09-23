import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";
import { ADJUSTMENT_TYPES } from "../../domain/payroll-adjustment.aggregate";

export class RegisterPayrollAdjustmentDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  entryDate!: string;

  @IsIn(ADJUSTMENT_TYPES)
  adjustmentType!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional() @IsString() notes?: string;
}
