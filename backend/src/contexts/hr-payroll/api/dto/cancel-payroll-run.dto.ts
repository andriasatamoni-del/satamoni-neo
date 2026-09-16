import { IsOptional, IsString } from "class-validator";

export class CancelPayrollRunDto {
  @IsOptional() @IsString() reason?: string;
}
