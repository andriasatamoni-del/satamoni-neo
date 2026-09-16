import { IsIn, IsOptional, IsString } from "class-validator";
import { PAYMENT_METHOD_KINDS, SETTLEMENT_CHANNELS } from "../../domain/payment-method.aggregate";

export class RegisterPaymentMethodDto {
  @IsString()
  name!: string;

  @IsIn(PAYMENT_METHOD_KINDS)
  kind!: string;

  @IsOptional() @IsIn(SETTLEMENT_CHANNELS) settlementChannel?: string;
}
