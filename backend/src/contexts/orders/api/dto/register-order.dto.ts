import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { ORDER_TYPES, POS_ORDER_SOURCES, type PosOrderSource } from "../../domain/order.aggregate";

export class OrderAddonInputDto {
  @IsUUID() variantId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class OrderItemInputDto {
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() comboId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderAddonInputDto)
  addons?: OrderAddonInputDto[];
}

export class RegisterOrderDto {
  @IsUUID()
  branchId!: string;

  @IsIn(ORDER_TYPES)
  orderType!: string;

  @IsOptional() @IsIn(POS_ORDER_SOURCES) source?: PosOrderSource;
  @IsOptional() @IsString() tableNumber?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() addressDetails?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() customerAddressId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsBoolean() stockApproved?: boolean;
  @IsOptional() @IsUUID() paymentMethodId?: string;
  @IsOptional() @IsUUID() clientRequestId?: string;
  @IsOptional() @IsString() @MaxLength(500) customerNotes?: string;
}
