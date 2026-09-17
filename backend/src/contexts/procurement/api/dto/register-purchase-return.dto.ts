import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, ValidateNested } from "class-validator";

export class PurchaseReturnLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsNumber() unitCost?: number;
}

export class RegisterPurchaseReturnDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() goodsReceiptId?: string;
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnLineInputDto)
  lines!: PurchaseReturnLineInputDto[];
}
