import { IsNumber, IsString } from "class-validator";

export class AddVariantDto {
  @IsString()
  label!: string;

  @IsNumber()
  price!: number;
}
