import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { PRINTER_TYPES, CONNECTION_TYPES } from "../../domain/printer.aggregate";

export class UpdatePrinterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(PRINTER_TYPES) printerType?: string;
  @IsOptional() @IsIn(CONNECTION_TYPES) connectionType?: string;
  @IsOptional() @IsString() osPrinterName?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsInt() port?: number;
  @IsOptional() @IsInt() @Min(20) paperWidthMm?: number;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsBoolean() isDefaultForType?: boolean;
}
