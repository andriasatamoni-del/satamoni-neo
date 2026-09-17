import { IsOptional, IsString } from "class-validator";

export class RejectPendingOrderDto {
  @IsOptional() @IsString() reason?: string;
}
