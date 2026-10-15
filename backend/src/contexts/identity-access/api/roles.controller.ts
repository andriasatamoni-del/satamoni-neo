import { Body, Controller, Param, Put, UseFilters, UseGuards } from "@nestjs/common";
import { UpdateRolePermissionsHandler } from "../application/commands/update-role-permissions.handler";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RequirePermission } from "./guards/require-permission.decorator";
import { DomainErrorFilter } from "./filters/domain-error.filter";
import { PERMISSION } from "../domain/permission";

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(DomainErrorFilter)
export class RolesController {
  constructor(private readonly updateRolePermissions: UpdateRolePermissionsHandler) {}

  @Put(":role/permissions")
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  update(@Param("role") role: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.updateRolePermissions.execute({ role, permissionKeys: dto.permissions });
  }
}
