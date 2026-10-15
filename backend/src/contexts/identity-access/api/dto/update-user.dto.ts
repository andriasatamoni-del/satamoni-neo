import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ROLES, type Role } from "../../domain/role";

export class UpdateUserDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: "لازم تختار دور واحد على الأقل" })
  @IsIn(ROLES, { each: true, message: "الدور ده مش معروف" })
  roles?: Role[];

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "لازم كلمة السر تكون 8 حروف على الأقل" })
  password?: string;
}
