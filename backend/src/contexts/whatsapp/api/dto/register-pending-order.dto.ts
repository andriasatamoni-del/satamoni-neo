import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from "class-validator";
import { ORDER_TYPES } from "../../../orders/domain/order.aggregate";

export class PendingOrderItemDto {
  @IsUUID() variantId!: string;
  @IsNumber() @IsPositive() quantity!: number;
}

export class RegisterPendingOrderDto {
  @IsIn(ORDER_TYPES) orderType!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsString() addressDetails?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PendingOrderItemDto)
  items!: PendingOrderItemDto[];
}
