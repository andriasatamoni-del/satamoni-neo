import { IsNumber, IsOptional } from "class-validator";

export class UpdateVariantDto {
  @IsNumber()
  price!: number;

  @IsOptional() @IsNumber() talabatPrice?: number;
}
