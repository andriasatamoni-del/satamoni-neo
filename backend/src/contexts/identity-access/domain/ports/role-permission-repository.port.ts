import type { Role } from "../role";
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

export interface RolePermissionRepositoryPort {
  permissionsForRoles(roles: readonly Role[]): Promise<Set<Permission>>;
  catalog(): Promise<PermissionGroup[]>;
  allRolePermissions(): Promise<Record<Role, string[]>>;
  unknownKeys(keys: readonly string[]): Promise<string[]>;
  replaceRolePermissions(role: Role, keys: readonly string[]): Promise<void>;
}

export const ROLE_PERMISSION_REPOSITORY = Symbol("ROLE_PERMISSION_REPOSITORY");
