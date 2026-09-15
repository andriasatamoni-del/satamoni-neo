import { IsNumber, IsOptional, IsString } from "class-validator";

export class AddVariantDto {
  @IsString()
  label!: string;

  @IsNumber()
  price!: number;

  @IsOptional() @IsNumber() talabatPrice?: number;
}
