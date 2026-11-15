import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ROLE_SCOPES, type RoleScope } from "../../domain/role";

export class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: "لازم تكتب اسم الدور" })
  @MaxLength(60)
  label!: string;

  @IsIn(ROLE_SCOPES, { message: "اختار نطاق الدور: مربوط بفرع أو عام" })
  scope!: RoleScope;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "لازم تكتب اسم الدور" })
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsIn(ROLE_SCOPES, { message: "اختار نطاق الدور: مربوط بفرع أو عام" })
  scope?: RoleScope;
}
