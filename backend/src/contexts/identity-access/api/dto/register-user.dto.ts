import { ArrayNotEmpty, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ROLES, type Role } from "../../domain/role";

export class RegisterUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail({}, { message: "الإيميل ده مش صحيح" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "لازم كلمة السر تكون 8 حروف على الأقل" })
  password!: string;

  @IsArray()
  @ArrayNotEmpty({ message: "لازم تختار دور واحد على الأقل" })
  @IsIn(ROLES, { each: true, message: "الدور ده مش معروف" })
  roles!: Role[];

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
