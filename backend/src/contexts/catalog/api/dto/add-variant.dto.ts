import { IsNumber, IsString, Min } from "class-validator";

export class AddVariantDto {
  @IsString()
  label!: string;

  @IsNumber()
  price!: number;

  @IsNumber() @Min(0) talabatPrice!: number;
}
