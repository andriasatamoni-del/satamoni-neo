import { IsOptional, IsString } from "class-validator";

export class CheckOutDriverDto {
  @IsOptional() @IsString() notes?: string;
}
