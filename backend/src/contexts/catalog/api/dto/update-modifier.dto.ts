import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateModifierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() priceDelta?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
