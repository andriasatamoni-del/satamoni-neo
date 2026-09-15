import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "الإيميل ده مش صحيح" })
  email!: string;

  @IsString()
  @MinLength(1, { message: "لازم تدخل كلمة السر" })
  password!: string;
}
