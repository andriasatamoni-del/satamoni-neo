import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";
import { ORDER_TYPES } from "../../domain/order.aggregate";

export class OrderItemInputDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class RegisterOrderDto {
  @IsUUID()
  branchId!: string;

  @IsIn(ORDER_TYPES)
  orderType!: string;

  @IsOptional() @IsString() tableNumber?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() addressDetails?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsBoolean() stockApproved?: boolean;
  @IsOptional() @IsUUID() paymentMethodId?: string;
}
