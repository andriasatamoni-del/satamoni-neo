import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export class GoodsReceiptLineInputDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitCost!: number;
}

export class RegisterGoodsReceiptDto {
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() supplierDocumentNumber?: string;
  @IsOptional() @IsBoolean() acknowledgeDuplicate?: boolean;

  @IsUUID()
  branchId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineInputDto)
  lines!: GoodsReceiptLineInputDto[];
}
