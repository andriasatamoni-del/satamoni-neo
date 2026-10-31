import { IsNumber } from "class-validator";

export class UpdateVariantDto {
  @IsNumber()
  price!: number;
}
