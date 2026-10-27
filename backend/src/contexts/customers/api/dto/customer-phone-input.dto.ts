import { IsOptional, IsString, MaxLength } from "class-validator";

export class CustomerPhoneInputDto {
  @IsString() @MaxLength(20) phone!: string;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
}
