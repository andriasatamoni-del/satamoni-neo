import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
import { ORDER_TYPES } from "../../domain/order.aggregate";

export class OrderItemInputDto {
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
