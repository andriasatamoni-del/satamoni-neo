import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { PRINTER_TYPES, CONNECTION_TYPES } from "../../domain/printer.aggregate";

export class RegisterPrinterDto {
  @IsOptional() @IsUUID() branchId?: string;

  @IsString()
  name!: string;

  @IsIn(PRINTER_TYPES)
  printerType!: string;

  @IsOptional() @IsIn(CONNECTION_TYPES) connectionType?: string;
  @IsOptional() @IsString() osPrinterName?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsInt() port?: number;
  @IsOptional() @IsInt() @Min(20) paperWidthMm?: number;
}
