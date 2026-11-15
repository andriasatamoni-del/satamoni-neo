import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { Role } from "../../domain/role";
import { isPermission } from "../../domain/permission";
import type { PermissionGroup, RoleAccess, RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";
import { permissions, rolePermissions, roles } from "./identity-access.tables";

@Injectable()
export class RolePermissionRepository implements RolePermissionRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async accessForRoles(userRoles: readonly Role[]): Promise<RoleAccess> {
    if (userRoles.length === 0) return { permissions: new Set(), scopes: [], labels: {}, fullAccess: false };
    const roleRows = await this.db
      .select({ key: roles.key, label: roles.label, scope: roles.scope, fullAccess: roles.full_access })
      .from(roles)
      .where(inArray(roles.key, [...userRoles]));
    const fullAccess = roleRows.some((r) => r.fullAccess);
    const permissionRows = fullAccess
      ? await this.db.select({ key: permissions.key }).from(permissions)
      : await this.db
          .selectDistinct({ key: rolePermissions.permission_key })
          .from(rolePermissions)
          .where(inArray(rolePermissions.role, [...userRoles]));
    return {
      permissions: new Set(permissionRows.map((r) => r.key).filter(isPermission)),
      scopes: roleRows.map((r) => r.scope),
      labels: Object.fromEntries(roleRows.map((r) => [r.key, r.label])),
      fullAccess,
    };
  }

  async catalog(): Promise<PermissionGroup[]> {
    const rows = await this.db.select().from(permissions).orderBy(asc(permissions.sort_order));
    const groups = new Map<string, PermissionGroup>();
    for (const row of rows) {
      let group = groups.get(row.group_key);
      if (!group) {
        group = { group: row.group_key, groupLabel: row.group_label, permissions: [] };
        groups.set(row.group_key, group);
      }
      group.permissions.push({ key: row.key, label: row.label });
    }
    return [...groups.values()];
  }

  async allRolePermissions(): Promise<Record<Role, string[]>> {
    const [roleRows, rows] = await Promise.all([
      this.db.select({ key: roles.key }).from(roles).orderBy(asc(roles.sort_order)),
      this.db
        .select({ role: rolePermissions.role, key: rolePermissions.permission_key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.key, rolePermissions.permission_key))
        .orderBy(asc(permissions.sort_order)),
    ]);
    const result: Record<Role, string[]> = Object.fromEntries(roleRows.map((r) => [r.key, [] as string[]]));
    for (const row of rows) result[row.role]?.push(row.key);
    return result;
  }

  async unknownKeys(keys: readonly string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.select({ key: permissions.key }).from(permissions).where(inArray(permissions.key, [...keys]));
    const known = new Set(rows.map((r) => r.key));
    return keys.filter((k) => !known.has(k));
  }
}
