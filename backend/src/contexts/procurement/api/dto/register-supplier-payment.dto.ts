import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class RegisterSupplierPaymentDto {
  @IsUUID() supplierId!: string;
  @IsUUID() branchId!: string;
  @IsUUID() treasuryId!: string;
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsUUID() supplierInvoiceId?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
