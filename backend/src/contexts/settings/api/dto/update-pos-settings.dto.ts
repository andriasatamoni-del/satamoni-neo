import { IsNumber, IsOptional, Min } from "class-validator";

export class UpdatePosSettingsDto {
  @IsOptional() @IsNumber() @Min(0) shiftVarianceAckThresholdEgp?: number;
  @IsOptional() @IsNumber() @Min(0) driverSettlementVarianceAckThresholdEgp?: number;
  @IsOptional() @IsNumber() @Min(0) driverHourlyRateEgp?: number;
  @IsOptional() @IsNumber() @Min(0) paymentAdjustmentHighThresholdEgp?: number;
  @IsOptional() @IsNumber() @Min(0) productionVarianceAlertPercent?: number;
}
