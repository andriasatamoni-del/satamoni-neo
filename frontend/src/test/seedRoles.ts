// Default role → permissions as seeded by the backend migration, so tests check the UI against the real seed
// instead of a hand-copied list. admin always has every permission (backend rule).
import seedSql from "../../../backend/drizzle/0002_seed_role_permissions.sql?raw";
import { PERMISSION, type Permission } from "../shared/auth/permissions";
import { ROLES, type Role } from "../shared/auth/roles";
import type { CurrentUser } from "../shared/auth/AuthContext";

const ALL_PERMISSIONS = Object.values(PERMISSION) as Permission[];

function parseSeed(): Record<Role, Permission[]> {
  const result = Object.fromEntries(ROLES.map((r) => [r, [] as Permission[]])) as Record<Role, Permission[]>;
  for (const [, role, key] of seedSql.matchAll(/\('(\w+)', '([\w.]+)'\)/g)) {
    if ((ROLES as string[]).includes(role) && (ALL_PERMISSIONS as string[]).includes(key)) {
      result[role as Role].push(key as Permission);
    }
  }
  result.admin = ALL_PERMISSIONS;
  return result;
}

export const SEEDED_ROLE_PERMISSIONS = parseSeed();

// A user like the ones `pnpm seed:dev` creates: one role, its default permissions, a branch unless company-wide.
export function seededUser(role: Role, overrides: Partial<CurrentUser> = {}): CurrentUser {
  const companyWide = role === "admin" || role === "accountant" || role === "callcenter";
  return {
    id: `user-${role}`,
    name: `Test ${role}`,
    email: `${role}@satamoni.dev`,
    roles: [role],
    branchId: companyWide ? null : "branch-1",
    isActive: true,
    permissions: SEEDED_ROLE_PERMISSIONS[role],
    ...overrides,
  };
}
