import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export class JournalEntryLineInputDto {
  @IsUUID()
  accountId!: string;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsOptional() @IsString() description?: string;
}

export class RegisterJournalEntryDto {
  @IsOptional() @IsDateString() entryDate?: string;
  @IsOptional() @IsString() description?: string;

  @IsString()
  sourceType!: string;

  @IsOptional() @IsUUID() branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineInputDto)
  lines!: JournalEntryLineInputDto[];
}
