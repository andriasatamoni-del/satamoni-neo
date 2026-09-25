import { IsString } from "class-validator";

export class LoginCustomerDto {
  @IsString() phone!: string;
  @IsString() password!: string;
}
