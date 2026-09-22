import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { RECONCILIATION_SOURCES } from "../../domain/reconciliation-record.aggregate";

export class ImportReconciliationRowDto {
  @IsDateString()
  externalDate!: string;

  @IsNumber()
  externalAmount!: number;

  @IsOptional() @IsString() externalReference?: string;
}

export class CommitReconciliationImportDto {
  @IsIn(RECONCILIATION_SOURCES)
  source!: string;

  @IsOptional() @IsUUID() branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportReconciliationRowDto)
  rows!: ImportReconciliationRowDto[];
}
