import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class RegisterExpenseDto {
  @IsUUID() branchId!: string;
  @IsDateString() businessDate!: string;
  @IsUUID() categoryId!: string;
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsIn(["DRAFT", "SUBMITTED", "POSTED"]) status?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}
