import type { Role, RoleScope } from "../domain/role";
import type { Permission } from "../domain/permission";

export interface AuthenticatedUser {
  id: string;
  roles: readonly Role[];
  branchId: string | null;
  permissions: ReadonlySet<Permission>;
  roleScopes: readonly RoleScope[];
  roleLabels: Readonly<Record<Role, string>>;
  fullAccess: boolean;
}
