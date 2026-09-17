import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class PurchaseOrderLineInputDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class RegisterPurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  purchaseRequestId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}
