import { IsOptional, IsString } from "class-validator";

export class CancelSupplierInvoiceDto {
  @IsOptional() @IsString() reason?: string;
}
