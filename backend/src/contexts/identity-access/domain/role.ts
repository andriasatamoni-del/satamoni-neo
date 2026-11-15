export type Role = string;

export const ROLE_SCOPE = {
  COMPANY: "company",
  BRANCH: "branch",
} as const;

export type RoleScope = (typeof ROLE_SCOPE)[keyof typeof ROLE_SCOPE];

export const ROLE_SCOPES = Object.values(ROLE_SCOPE) as [RoleScope, ...RoleScope[]];

export function uniqueRoles(roles: readonly Role[]): Role[] {
  return [...new Set(roles)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
