import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from "class-validator";
import { PurchaseLineInputDto } from "./purchase-line-input.dto";

export class RegisterPurchaseDto {
  @IsUUID() branchId!: string;
  @IsDateString() businessDate!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() supplierDocumentNumber?: string;
  @IsOptional() @IsBoolean() acknowledgeDuplicate?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineInputDto)
  items?: PurchaseLineInputDto[];
}
