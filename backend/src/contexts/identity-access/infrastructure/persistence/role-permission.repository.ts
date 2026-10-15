import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { ROLES, type Role } from "../../domain/role";
import { isPermission, type Permission } from "../../domain/permission";
import type { PermissionGroup, RolePermissionRepositoryPort } from "../../domain/ports/role-permission-repository.port";
import { permissions, rolePermissions } from "./identity-access.tables";

@Injectable()
export class RolePermissionRepository implements RolePermissionRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async permissionsForRoles(roles: readonly Role[]): Promise<Set<Permission>> {
    if (roles.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ key: rolePermissions.permission_key })
      .from(rolePermissions)
      .where(inArray(rolePermissions.role, [...roles]));
    return new Set(rows.map((r) => r.key).filter(isPermission));
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
    const rows = await this.db
      .select({ role: rolePermissions.role, key: rolePermissions.permission_key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.key, rolePermissions.permission_key))
      .orderBy(asc(permissions.sort_order));
    const result = Object.fromEntries(ROLES.map((r) => [r, [] as string[]])) as Record<Role, string[]>;
    for (const row of rows) result[row.role].push(row.key);
    return result;
  }

  async unknownKeys(keys: readonly string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.select({ key: permissions.key }).from(permissions).where(inArray(permissions.key, [...keys]));
    const known = new Set(rows.map((r) => r.key));
    return keys.filter((k) => !known.has(k));
  }

  async replaceRolePermissions(role: Role, keys: readonly string[]): Promise<void> {
    const unique = [...new Set(keys)];
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.role, role));
      if (unique.length > 0) await tx.insert(rolePermissions).values(unique.map((key) => ({ role, permission_key: key })));
    });
  }
}
