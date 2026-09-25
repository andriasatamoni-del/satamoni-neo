import { IsBoolean, IsOptional, IsString } from "class-validator";

export class AddCustomerAddressDto {
  @IsOptional() @IsString() label?: string;
  @IsString() addressDetails!: string;
  @IsOptional() @IsString() distinguishingMark?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
