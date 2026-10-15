import { Inject, Injectable } from "@nestjs/common";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";

@Injectable()
export class GetPermissionsCatalogHandler {
  constructor(@Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort) {}

  async execute() {
    const [catalog, rolePermissions] = await Promise.all([this.rolePermissions.catalog(), this.rolePermissions.allRolePermissions()]);
    return { catalog, rolePermissions };
  }
}
