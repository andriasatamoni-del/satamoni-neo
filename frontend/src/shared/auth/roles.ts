import type { Permission } from "./permissions";

export type Role = string;

export type RoleScope = "company" | "branch";

export const ROLE_SCOPE_LABELS: Record<RoleScope, string> = {
  company: "عام على كل الفروع",
  branch: "مربوط بفرع المستخدم",
};

export interface RoleOption {
  key: Role;
  label: string;
  scope: RoleScope;
  fullAccess: boolean;
}

export function can(user: { permissions: readonly Permission[] } | null | undefined, ...permissions: Permission[]): boolean {
  return !!user && permissions.some((p) => user.permissions.includes(p));
}

export function roleLabel(role: Role, labels?: Readonly<Record<Role, string>>): string {
  return labels?.[role] ?? role;
}

export function roleLabels(roles: readonly Role[], labels?: Readonly<Record<Role, string>>): string {
  return roles.map((r) => roleLabel(r, labels)).join("، ");
}

export function isCompanyWide(user: { companyWide?: boolean } | null | undefined): boolean {
  return !!user?.companyWide;
}

export function hasFullAccess(user: { fullAccess?: boolean } | null | undefined): boolean {
  return !!user?.fullAccess;
}
