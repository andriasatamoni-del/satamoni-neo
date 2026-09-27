import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CompleteConversionOrderDto {
  @IsNumber() @IsPositive() actualOutputQuantity!: number;
  @IsOptional() @IsString() varianceReason?: string;
  // BATCH-1: لو فعليًا اتحدد، بتتسجّل دفعة للناتج
  @IsOptional() @IsDateString() expiryDate?: string;
}
