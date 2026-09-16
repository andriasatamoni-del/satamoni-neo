import { IsUUID } from "class-validator";

export class MatchReconciliationRecordDto {
  @IsUUID()
  paymentId!: string;
}
