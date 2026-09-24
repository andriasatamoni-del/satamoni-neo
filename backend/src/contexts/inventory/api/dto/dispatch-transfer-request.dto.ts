import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class DispatchTransferRequestDto {
  @IsOptional() @IsObject() quantities?: Record<string, number>;
  @IsOptional() @IsBoolean() approved?: boolean;
}
