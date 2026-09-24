import { IsNumber, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterExpenseCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsNumber() alertThreshold?: number;
}
