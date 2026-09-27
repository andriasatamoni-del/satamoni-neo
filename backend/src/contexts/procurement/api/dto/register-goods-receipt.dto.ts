import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export class GoodsReceiptLineInputDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitCost!: number;

  // BATCH-1: لو فعليًا اتحدد، بتتسجّل دفعة (inventory_batches) للبند ده وقت تأكيد الاستلام
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsDateString() productionDate?: string;
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
