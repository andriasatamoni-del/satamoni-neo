import { IsString, MinLength } from "class-validator";

export class RegisterBankDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
