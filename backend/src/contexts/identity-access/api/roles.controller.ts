import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseFilters, UseGuards } from "@nestjs/common";
import { UpdateRolePermissionsHandler } from "../application/commands/update-role-permissions.handler";
import { CreateRoleHandler } from "../application/commands/create-role.handler";
import { UpdateRoleHandler } from "../application/commands/update-role.handler";
import { DeleteRoleHandler } from "../application/commands/delete-role.handler";
import { ListRolesHandler } from "../application/queries/list-roles.handler";
import type { RoleDefinition } from "../domain/role-definition.aggregate";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { CreateRoleDto, UpdateRoleDto } from "./dto/save-role.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RequirePermission } from "./guards/require-permission.decorator";
import { DomainErrorFilter } from "./filters/domain-error.filter";
import { PERMISSION } from "../domain/permission";

function toRoleResponse(role: RoleDefinition) {
  return { key: role.key, label: role.label, scope: role.scope, fullAccess: role.fullAccess, permissions: [...role.permissions] };
}

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(DomainErrorFilter)
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesHandler,
    private readonly createRole: CreateRoleHandler,
    private readonly updateRole: UpdateRoleHandler,
    private readonly deleteRole: DeleteRoleHandler,
    private readonly updateRolePermissions: UpdateRolePermissionsHandler
  ) {}

  @Get()
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  list() {
    return this.listRoles.execute();
  }

  @Post()
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  async create(@Body() dto: CreateRoleDto) {
    return toRoleResponse(await this.createRole.execute({ label: dto.label, scope: dto.scope, permissionKeys: dto.permissions }));
  }

  @Patch(":role")
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  async update(@Param("role") role: string, @Body() dto: UpdateRoleDto) {
    return toRoleResponse(await this.updateRole.execute({ key: role, label: dto.label, scope: dto.scope }));
  }

  @Delete(":role")
  @HttpCode(204)
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  async remove(@Param("role") role: string): Promise<void> {
    await this.deleteRole.execute(role);
  }

  @Put(":role/permissions")
  @RequirePermission(PERMISSION.IDENTITY_ROLES_MANAGE)
  updatePermissions(@Param("role") role: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.updateRolePermissions.execute({ role, permissionKeys: dto.permissions });
  }
}
