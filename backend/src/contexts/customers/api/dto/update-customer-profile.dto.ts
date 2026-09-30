import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateCustomerProfileDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone2?: string;
}
