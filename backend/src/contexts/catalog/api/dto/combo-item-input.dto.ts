import { Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsPositive, IsUUID, ValidateNested } from "class-validator";

export class ComboAddonInputDto {
  @IsUUID() variantId!: string;
  @IsOptional() @IsInt() @IsPositive() quantity?: number;
}

export class ComboItemInputDto {
  @IsUUID() variantId!: string;
  @IsOptional() @IsInt() @IsPositive() quantity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboAddonInputDto)
  addons?: ComboAddonInputDto[];
}
