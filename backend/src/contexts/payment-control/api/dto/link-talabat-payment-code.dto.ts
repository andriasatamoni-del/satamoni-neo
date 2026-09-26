import { IsOptional, IsString } from "class-validator";

export class LinkTalabatPaymentCodeDto {
  @IsOptional() @IsString() talabatPaymentCode?: string | null;
}
