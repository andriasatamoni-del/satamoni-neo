import { IsNumber } from "class-validator";

export class SetModifierVariantPriceDto {
  @IsNumber()
  priceDelta!: number;
}
