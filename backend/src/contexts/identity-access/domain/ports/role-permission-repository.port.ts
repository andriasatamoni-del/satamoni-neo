import type { Role, RoleScope } from "../role";
import type { Permission } from "../permission";

export interface PermissionDefinition {
  key: string;
  label: string;
}

export interface PermissionGroup {
  group: string;
  groupLabel: string;
  permissions: PermissionDefinition[];
}

export interface RoleAccess {
  permissions: Set<Permission>;
  scopes: RoleScope[];
  labels: Record<Role, string>;
  fullAccess: boolean;
}

export interface RolePermissionRepositoryPort {
  accessForRoles(roles: readonly Role[]): Promise<RoleAccess>;
  catalog(): Promise<PermissionGroup[]>;
  allRolePermissions(): Promise<Record<Role, string[]>>;
  unknownKeys(keys: readonly string[]): Promise<string[]>;
}

export const ROLE_PERMISSION_REPOSITORY = Symbol("ROLE_PERMISSION_REPOSITORY");
