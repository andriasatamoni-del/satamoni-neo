import { Inject, Injectable } from "@nestjs/common";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";
import { ROLE_REPOSITORY, type RoleRepositoryPort } from "../../domain/ports/role-repository.port";

@Injectable()
export class GetPermissionsCatalogHandler {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort
  ) {}

  async execute() {
    const [catalog, rolePermissions, roles] = await Promise.all([
      this.rolePermissions.catalog(),
      this.rolePermissions.allRolePermissions(),
      this.roles.list(),
    ]);
    return {
      catalog,
      rolePermissions,
      roles: roles.map(({ key, label, scope, fullAccess }) => ({ key, label, scope, fullAccess })),
    };
  }
}
