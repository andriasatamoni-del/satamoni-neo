import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CASH_DRAWER_ENTRY_TYPES } from "../../domain/cash-drawer-entry.aggregate";

export class RegisterCashDrawerEntryDto {
  @IsIn(CASH_DRAWER_ENTRY_TYPES)
  entryType!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional() @IsString() notes?: string;
}
