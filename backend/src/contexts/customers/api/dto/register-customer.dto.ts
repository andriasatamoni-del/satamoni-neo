import { IsString } from "class-validator";

export class RegisterCustomerDto {
  @IsString() phone!: string;
  @IsString() name!: string;
  @IsString() password!: string;
}
