import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export class VariantInputDto {
  @IsString()
  label!: string;

  @IsNumber()
  price!: number;

  @IsOptional() @IsNumber() talabatPrice?: number;
}

export class RegisterMenuItemDto {
  @IsOptional() @IsUUID() categoryId?: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isBest?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants?: VariantInputDto[];
}
