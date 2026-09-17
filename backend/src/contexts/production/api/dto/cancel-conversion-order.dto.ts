import { IsOptional, IsString } from "class-validator";

export class CancelConversionOrderDto {
  @IsOptional() @IsString() reason?: string;
}
