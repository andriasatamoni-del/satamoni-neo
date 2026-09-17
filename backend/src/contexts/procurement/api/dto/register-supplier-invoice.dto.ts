import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, ValidateNested } from "class-validator";

export class SupplierInvoiceLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() invoicedQuantity!: number;
  @IsNumber() unitPrice!: number;
}

export class RegisterSupplierInvoiceDto {
  @IsUUID() supplierId!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() goodsReceiptId?: string;
  @IsString() @MinLength(1) supplierInvoiceNumber!: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() tax?: number;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineInputDto)
  lines!: SupplierInvoiceLineInputDto[];
}
