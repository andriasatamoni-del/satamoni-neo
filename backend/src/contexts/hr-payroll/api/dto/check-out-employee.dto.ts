import { IsOptional, IsString } from "class-validator";

export class CheckOutEmployeeDto {
  @IsOptional() @IsString() notes?: string;
}
