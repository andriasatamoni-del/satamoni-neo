import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";

export class StocktakeLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @Min(0) actualQuantity!: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() chargeAccountCode?: string;
}

export class RegisterStocktakeDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineInputDto)
  lines!: StocktakeLineInputDto[];
}
