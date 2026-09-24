import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { ComboItemInputDto } from "./combo-item-input.dto";

export class ReplaceComboItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboItemInputDto)
  items!: ComboItemInputDto[];
}
