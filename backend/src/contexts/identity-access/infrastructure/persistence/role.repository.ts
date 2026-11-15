import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray, max, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { RoleDefinition } from "../../domain/role-definition.aggregate";
import type { Role } from "../../domain/role";
import type { RoleRepositoryPort, RoleSummary } from "../../domain/ports/role-repository.port";
import { permissions, rolePermissions, roles, userRoles } from "./identity-access.tables";

@Injectable()
export class RoleRepository implements RoleRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<RoleSummary[]> {
    const [roleRows, permissionRows, countRows] = await Promise.all([
      this.db.select().from(roles).orderBy(asc(roles.sort_order), asc(roles.created_at)),
      this.db
        .select({ role: rolePermissions.role, key: rolePermissions.permission_key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.key, rolePermissions.permission_key))
        .orderBy(asc(permissions.sort_order)),
      this.db.select({ role: userRoles.role, total: count() }).from(userRoles).groupBy(userRoles.role),
    ]);
    const permissionsByRole = new Map<Role, string[]>();
    for (const row of permissionRows) permissionsByRole.set(row.role, [...(permissionsByRole.get(row.role) ?? []), row.key]);
    const usersByRole = new Map(countRows.map((r) => [r.role, Number(r.total)]));
    return roleRows.map((row) => ({
      key: row.key,
      label: row.label,
      scope: row.scope,
      fullAccess: row.full_access,
      permissions: permissionsByRole.get(row.key) ?? [],
      userCount: usersByRole.get(row.key) ?? 0,
    }));
  }

  async findByKey(key: Role): Promise<RoleDefinition | null> {
    const [row] = await this.db.select().from(roles).where(eq(roles.key, key)).limit(1);
    if (!row) return null;
    const permissionRows = await this.db
      .select({ key: rolePermissions.permission_key })
      .from(rolePermissions)
      .where(eq(rolePermissions.role, key));
    return RoleDefinition.reconstitute(row.key, {
      label: row.label,
      scope: row.scope,
      fullAccess: row.full_access,
      sortOrder: row.sort_order,
      permissions: permissionRows.map((r) => r.key),
    });
  }

  async save(role: RoleDefinition): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(roles)
        .values({ key: role.key, label: role.label, scope: role.scope, full_access: role.fullAccess, sort_order: role.sortOrder })
        .onConflictDoUpdate({ target: roles.key, set: { label: role.label, scope: role.scope } });
      await tx.delete(rolePermissions).where(eq(rolePermissions.role, role.key));
      if (role.permissions.length > 0) {
        await tx.insert(rolePermissions).values(role.permissions.map((key) => ({ role: role.key, permission_key: key })));
      }
    });
  }

  async delete(key: Role): Promise<void> {
    await this.db.delete(roles).where(eq(roles.key, key));
  }

  async missingKeys(keys: readonly Role[]): Promise<Role[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.select({ key: roles.key }).from(roles).where(inArray(roles.key, [...keys]));
    const known = new Set(rows.map((r) => r.key));
    return keys.filter((k) => !known.has(k));
  }

  async isLabelTaken(label: string, exceptKey?: Role): Promise<boolean> {
    const [row] = await this.db
      .select({ key: roles.key })
      .from(roles)
      .where(and(eq(roles.label, label.trim()), exceptKey ? ne(roles.key, exceptKey) : undefined))
      .limit(1);
    return !!row;
  }

  async userCount(key: Role): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(userRoles).where(eq(userRoles.role, key));
    return Number(row?.total ?? 0);
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await this.db.select({ value: max(roles.sort_order) }).from(roles);
    return Number(row?.value ?? 0) + 1;
  }

  async fullAccessKeys(): Promise<Role[]> {
    const rows = await this.db.select({ key: roles.key }).from(roles).where(eq(roles.full_access, true));
    return rows.map((r) => r.key);
  }
}
