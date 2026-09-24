import { IsObject, IsOptional } from "class-validator";

export class ReceiveTransferRequestDto {
  @IsOptional() @IsObject() quantities?: Record<string, number>;
}
