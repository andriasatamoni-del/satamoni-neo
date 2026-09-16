import { IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class RequestPaymentAdjustmentDto {
  @IsUUID()
  paymentId!: string;

  @IsOptional() @IsString() reason?: string;

  // اختياري عمدًا - لو مش متحدد يبقى "خليها زي ما هي، صحّح المبلغ بس" (نفس فلسفة الريبو القديم بالحرف)
  @IsOptional() @IsUUID() proposedPaymentMethodId?: string;

  @IsNumber()
  proposedAmount!: number;
}
