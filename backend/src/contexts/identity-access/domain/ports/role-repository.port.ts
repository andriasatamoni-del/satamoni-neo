import type { RoleDefinition } from "../role-definition.aggregate";
import type { Role, RoleScope } from "../role";

export interface RoleSummary {
  key: Role;
  label: string;
  scope: RoleScope;
  fullAccess: boolean;
  permissions: string[];
  userCount: number;
}

export interface RoleRepositoryPort {
  list(): Promise<RoleSummary[]>;
  findByKey(key: Role): Promise<RoleDefinition | null>;
  save(role: RoleDefinition): Promise<void>;
  delete(key: Role): Promise<void>;
  missingKeys(keys: readonly Role[]): Promise<Role[]>;
  isLabelTaken(label: string, exceptKey?: Role): Promise<boolean>;
  userCount(key: Role): Promise<number>;
  nextSortOrder(): Promise<number>;
  fullAccessKeys(): Promise<Role[]>;
}

export const ROLE_REPOSITORY = Symbol("ROLE_REPOSITORY");
