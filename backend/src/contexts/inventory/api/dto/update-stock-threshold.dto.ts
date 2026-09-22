import { IsOptional, IsUUID, Min } from "class-validator";

export class UpdateStockThresholdDto {
  @IsUUID() branchId!: string;
  @IsUUID() inventoryItemId!: string;

  @IsOptional() @Min(0) reorderPoint?: number;
  @IsOptional() @Min(0) minStock?: number;
  @IsOptional() @Min(0) maxStock?: number;
}
