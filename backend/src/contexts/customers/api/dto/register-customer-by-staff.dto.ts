import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { AddressInputDto } from "./address-input.dto";
import { CustomerPhoneInputDto } from "./customer-phone-input.dto";

export class RegisterCustomerByStaffDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(20) phone!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomerPhoneInputDto)
  extraPhones?: CustomerPhoneInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AddressInputDto)
  addresses?: AddressInputDto[];
}
