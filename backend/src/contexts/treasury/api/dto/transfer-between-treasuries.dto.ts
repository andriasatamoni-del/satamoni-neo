import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class TransferBetweenTreasuriesDto {
  @IsUUID()
  toTreasuryId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional() @IsString() notes?: string;
}
