import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class UpdateComboDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
