import { Type } from "class-transformer";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { PurchaseLineInputDto } from "./purchase-line-input.dto";

export class EditPurchaseDto {
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineInputDto)
  items?: PurchaseLineInputDto[];
}
