import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
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
}
