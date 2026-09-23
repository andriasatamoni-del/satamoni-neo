import { IsString, MinLength } from "class-validator";

export class CancelPayrollAdjustmentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
