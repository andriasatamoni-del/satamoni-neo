import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class EditExpenseDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsString() notes?: string;
}
