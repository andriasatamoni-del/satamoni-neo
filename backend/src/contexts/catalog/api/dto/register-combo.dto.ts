import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsString, ValidateNested } from "class-validator";
import { ComboItemInputDto } from "./combo-item-input.dto";

export class RegisterComboDto {
  @IsString() name!: string;
  @IsNumber() @IsPositive() price!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboItemInputDto)
  items!: ComboItemInputDto[];
}
