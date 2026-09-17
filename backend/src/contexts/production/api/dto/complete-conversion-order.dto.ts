import { IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CompleteConversionOrderDto {
  @IsNumber() @IsPositive() actualOutputQuantity!: number;
  @IsOptional() @IsString() varianceReason?: string;
}
