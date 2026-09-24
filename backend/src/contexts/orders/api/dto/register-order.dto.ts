import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";
import { ORDER_TYPES } from "../../domain/order.aggregate";

export class OrderItemInputDto {
  // إما variantId لصنف عادي أو comboId لعرض - نفس قيد order_items.combo_id بالظبط (راجع تعليق
  // Order.aggregate.ts). التحقق الفعلي إن واحد بس منهم متحدد بيحصل في RegisterOrderHandler.
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() comboId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  modifierIds?: string[];
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
  // من وضع الكاشير الأوفلاين - راجع تعليق Order.clientRequestId
  @IsOptional() @IsUUID() clientRequestId?: string;
}
