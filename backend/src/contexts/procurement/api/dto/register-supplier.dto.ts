import { IsEmail, IsOptional, IsString } from "class-validator";

export class RegisterSupplierDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}
