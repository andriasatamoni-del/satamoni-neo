import { IsOptional, IsString } from "class-validator";

export class RejectPurchaseDto {
  @IsOptional() @IsString() reason?: string;
}
