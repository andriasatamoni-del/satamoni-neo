import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class RegisterDriverSettlementDto {
  @IsUUID() driverId!: string;
  @IsUUID() branchId!: string;
  @IsNumber() @Min(0) actualHandover!: number;
  @IsOptional() @IsString() notes?: string;
}
