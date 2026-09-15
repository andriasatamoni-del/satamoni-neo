import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { MOVEMENT_TYPES } from "../../domain/stock-movement.aggregate";

export class RecordStockMovementDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsUUID()
  branchId!: string;

  @IsIn(MOVEMENT_TYPES)
  movementType!: string;

  @IsNumber()
  quantityDelta!: number;

  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsBoolean() approved?: boolean;
}
