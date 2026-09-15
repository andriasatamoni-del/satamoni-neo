import { Injectable } from "@nestjs/common";
import { PermissionRegistry } from "../../../../shared/permissions/permission-registry";
import { ROLES } from "../../domain/role";

@Injectable()
export class GetPermissionsCatalogHandler {
  constructor(private readonly permissions: PermissionRegistry) {}

  execute() {
    const rolePermissions: Record<string, string[]> = {};
    for (const role of ROLES) {
      rolePermissions[role] =
        role === "admin" ? this.permissions.getAllKeys() : [...this.permissions.getRoleDefaults(role)];
    }
    return { catalog: this.permissions.getCatalog(), rolePermissions };
  }
}
