import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from "class-validator";

export class PurchaseRequestLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() requestedQuantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RegisterPurchaseRequestDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsDateString() requiredDate?: string;
  @IsOptional() @IsString() reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineInputDto)
  lines!: PurchaseRequestLineInputDto[];
}
