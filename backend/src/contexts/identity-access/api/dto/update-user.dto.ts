import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ROLES } from "../../domain/role";

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES, { message: "الدور ده مش معروف" })
  role?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "لازم كلمة السر تكون 8 حروف على الأقل" })
  password?: string;
}
