import { IsOptional, IsString, IsUUID } from "class-validator";

export class RegisterDriverDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() phone?: string;

  @IsUUID()
  branchId!: string;
}
