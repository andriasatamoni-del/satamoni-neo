import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import type { Role, RoleOption } from "../../shared/auth/roles";

export interface PermissionDef { key: string; label: string; }
export interface PermissionGroup { group: string; groupLabel: string; permissions: PermissionDef[]; }
export interface PermissionsCatalog { catalog: PermissionGroup[]; rolePermissions: Record<Role, string[]>; roles: RoleOption[]; }

export const PERMISSIONS_CATALOG_KEY = ["users", "permissions-catalog"] as const;

export function usePermissionsCatalog(enabled: boolean) {
  return useQuery({
    queryKey: PERMISSIONS_CATALOG_KEY,
    queryFn: () => apiRequest<PermissionsCatalog>("/users/permissions-catalog"),
    enabled,
    retry: false,
  });
}

export function roleOptionsOf(catalog: PermissionsCatalog | undefined): RoleOption[] {
  return catalog?.roles ?? [];
}

export function roleLabelMap(catalog: PermissionsCatalog | undefined): Record<Role, string> {
  return Object.fromEntries(roleOptionsOf(catalog).map((r) => [r.key, r.label]));
}

export function fullAccessRoles(catalog: PermissionsCatalog | undefined): Role[] {
  return roleOptionsOf(catalog).filter((r) => r.fullAccess).map((r) => r.key);
}

export function rolePermissionCountLabel(role: RoleOption, catalog: PermissionsCatalog): string {
  return role.fullAccess ? "كل الصلاحيات" : `${catalog.rolePermissions[role.key]?.length ?? 0} صلاحية`;
}

export function effectivePermissionCount(roles: readonly Role[], catalog: PermissionsCatalog): number {
  if (roles.some((r) => fullAccessRoles(catalog).includes(r))) return catalog.catalog.reduce((sum, g) => sum + g.permissions.length, 0);
  return new Set(roles.flatMap((r) => catalog.rolePermissions[r] ?? [])).size;
}

export function needsBranch(roles: readonly Role[], catalog: PermissionsCatalog | undefined): boolean {
  const options = roleOptionsOf(catalog).filter((r) => roles.includes(r.key));
  return options.length > 0 && options.every((r) => r.scope === "branch");
}
