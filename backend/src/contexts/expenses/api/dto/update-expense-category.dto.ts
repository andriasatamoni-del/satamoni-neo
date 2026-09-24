import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateExpenseCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() alertThreshold?: number | null;
  @IsOptional() @IsUUID() accountId?: string | null;
}
