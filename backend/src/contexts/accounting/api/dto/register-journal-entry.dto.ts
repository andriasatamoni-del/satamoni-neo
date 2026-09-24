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

// sourceType مش موجود هنا عمدًا - القيد اليدوي من الـAPI العام ده دايمًا "manual" (مفروض من السيرفر،
// راجع تعليق AccountingController.createJournalEntry)، مش قيمة العميل يقدر يتحكم فيها. لو سمحنا
// بقيمة حرة هنا، أي عميل يقدر يدّعي sourceType زي "supplier_payment" ويتجنّب مسار DRAFT/post الجديد
export class RegisterJournalEntryDto {
  @IsOptional() @IsDateString() entryDate?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsUUID() branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineInputDto)
  lines!: JournalEntryLineInputDto[];
}
