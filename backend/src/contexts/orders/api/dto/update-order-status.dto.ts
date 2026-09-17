import { IsIn, IsOptional } from "class-validator";
import { ORDER_STATUSES } from "../../domain/order.aggregate";

export class UpdateOrderStatusDto {
  @IsOptional() @IsIn(ORDER_STATUSES) status?: string;
}
