import { IsBoolean, IsNumber, IsOptional, IsPositive } from "class-validator";

export class WriteOffInventoryBatchDto {
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsBoolean() markExpired?: boolean;
}
