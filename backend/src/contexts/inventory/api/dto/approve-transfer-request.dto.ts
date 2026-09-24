import { IsObject, IsOptional } from "class-validator";

export class ApproveTransferRequestDto {
  @IsOptional() @IsObject() approvedQuantities?: Record<string, number>;
}
