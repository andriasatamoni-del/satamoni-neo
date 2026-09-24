import { IsNumber, IsPositive, IsUUID, Min } from "class-validator";

export class PurchaseLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
}
