import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { ROLE, type Role } from "../../shared/auth/roles";

export interface PermissionDef { key: string; label: string; }
export interface PermissionGroup { group: string; groupLabel: string; permissions: PermissionDef[]; }
export interface PermissionsCatalog { catalog: PermissionGroup[]; rolePermissions: Record<Role, string[]>; }

export const PERMISSIONS_CATALOG_KEY = ["users", "permissions-catalog"] as const;

export function usePermissionsCatalog(enabled: boolean) {
  return useQuery({
    queryKey: PERMISSIONS_CATALOG_KEY,
    queryFn: () => apiRequest<PermissionsCatalog>("/users/permissions-catalog"),
    enabled,
    retry: false,
  });
}

export function rolePermissionCountLabel(role: Role, catalog: PermissionsCatalog): string {
  return role === ROLE.ADMIN ? "كل الصلاحيات" : `${catalog.rolePermissions[role]?.length ?? 0} صلاحية`;
}

export function effectivePermissionCount(roles: readonly Role[], catalog: PermissionsCatalog): number {
  return new Set(roles.flatMap((r) => catalog.rolePermissions[r] ?? [])).size;
}
