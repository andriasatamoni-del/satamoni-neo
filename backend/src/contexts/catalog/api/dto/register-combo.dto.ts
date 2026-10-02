import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from "class-validator";
import { ComboItemInputDto } from "./combo-item-input.dto";

export class RegisterComboDto {
  @IsString() name!: string;
  @IsNumber() @IsPositive() price!: number;
  @IsOptional() @IsString() @MaxLength(300) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsBoolean() onlineOnly?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboItemInputDto)
  items!: ComboItemInputDto[];
}
