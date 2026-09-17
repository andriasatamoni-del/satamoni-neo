import { IsOptional, IsUUID } from "class-validator";

export class ConfirmPendingOrderDto {
  @IsOptional() @IsUUID() paymentMethodId?: string;
}
