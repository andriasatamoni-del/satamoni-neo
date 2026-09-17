import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { DISPATCH_STATUSES } from "../../domain/delivery-assignment.aggregate";

export class UpdateDeliveryStatusDto {
  @IsIn(DISPATCH_STATUSES)
  status!: string;

  @IsOptional() @IsString() failureReason?: string;
  @IsOptional() @IsNumber() collectedAmount?: number;
}
