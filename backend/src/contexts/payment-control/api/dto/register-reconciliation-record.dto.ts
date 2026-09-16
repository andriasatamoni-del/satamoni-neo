import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { RECONCILIATION_SOURCES } from "../../domain/reconciliation-record.aggregate";

export class RegisterReconciliationRecordDto {
  @IsOptional() @IsUUID() branchId?: string;

  @IsIn(RECONCILIATION_SOURCES)
  source!: string;

  @IsOptional() @IsString() externalReference?: string;

  @IsNumber()
  externalAmount!: number;

  @IsDateString()
  externalDate!: string;

  @IsOptional() @IsString() notes?: string;
}
