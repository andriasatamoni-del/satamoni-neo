import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ROLES } from "../../domain/role";

export class RegisterUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail({}, { message: "الإيميل ده مش صحيح" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "لازم كلمة السر تكون 8 حروف على الأقل" })
  password!: string;

  @IsIn(ROLES, { message: "الدور ده مش معروف" })
  role!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
