import { IsNumber, IsString } from "class-validator";

export class AddModifierDto {
  @IsString()
  name!: string;

  @IsNumber()
  priceDelta!: number;
}
