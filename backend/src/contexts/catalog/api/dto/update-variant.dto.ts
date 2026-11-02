import { IsNumber, Min, ValidateIf } from "class-validator";

export class UpdateVariantDto {
  @ValidateIf((dto: UpdateVariantDto) => dto.price !== undefined || dto.talabatPrice === undefined)
  @IsNumber()
  price?: number;

  @ValidateIf((dto: UpdateVariantDto) => dto.talabatPrice !== undefined) @IsNumber() @Min(0) talabatPrice?: number;
}
