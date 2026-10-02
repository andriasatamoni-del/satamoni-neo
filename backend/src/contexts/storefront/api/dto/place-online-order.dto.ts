import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { MAX_ONLINE_LINE_QUANTITY, MAX_ONLINE_ORDER_LINES, ONLINE_ORDER_TYPES } from "../../domain/online-order";

export class OnlineOrderItemDto {
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() comboId?: string;
  @IsInt() @Min(1) @Max(MAX_ONLINE_LINE_QUANTITY) quantity!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) modifierIds?: string[];
}

// مفيش أي سعر ولا بيانات عميل هنا خالص - السيرفر بيحسب الأسعار من المنيو، والاسم والتليفونين والعنوان من
// حساب العميل (العنوان بالـid من دفتر عناوينه)
export class PlaceOnlineOrderDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() branchId!: string;
  @IsIn(ONLINE_ORDER_TYPES) orderType!: string;
  @IsOptional() @IsUUID() addressId?: string;
  @IsOptional() @IsString() @MaxLength(10) tableNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsUUID() rewardId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ONLINE_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => OnlineOrderItemDto)
  items!: OnlineOrderItemDto[];
}
