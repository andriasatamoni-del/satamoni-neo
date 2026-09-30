import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class UpdateComboDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(300) imageUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsBoolean() onlineOnly?: boolean;
}
