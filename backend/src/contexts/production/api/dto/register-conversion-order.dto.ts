import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class RegisterConversionOrderDto {
  @IsUUID() branchId!: string;
  @IsUUID() recipeId!: string;
  @IsNumber() @IsPositive() plannedOutputQuantity!: number;
  @IsOptional() @IsString() notes?: string;
}
