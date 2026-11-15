import { PERMISSION, type Permission } from "../shared/auth/permissions";
import type { RoleOption } from "../shared/auth/roles";
import type { CurrentUser } from "../shared/auth/AuthContext";

const MIGRATIONS = import.meta.glob<string>("../../../backend/drizzle/*.sql", { query: "?raw", import: "default", eager: true });
const seedSql = Object.keys(MIGRATIONS).sort().map((file) => MIGRATIONS[file]).join("\n");

const ALL_PERMISSIONS = Object.values(PERMISSION) as Permission[];

function parseSeededRoles(): RoleOption[] {
  const rows = seedSql.matchAll(/\('(\w+)', '([^']+)', '(company|branch)', (true|false), \d+\)/g);
  return [...rows].map(([, key, label, scope, fullAccess]) => ({ key, label, scope: scope as RoleOption["scope"], fullAccess: fullAccess === "true" }));
}

export const SEEDED_ROLES = parseSeededRoles();

function seededRole(key: string): RoleOption {
  const role = SEEDED_ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`role "${key}" is not seeded by any migration`);
  return role;
}

function parsePermissions(): Record<string, Permission[]> {
  const result: Record<string, Permission[]> = Object.fromEntries(SEEDED_ROLES.map((r) => [r.key, [] as Permission[]]));
  for (const [, role, key] of seedSql.matchAll(/\('(\w+)', '([\w.]+)'\)/g)) {
    if (result[role] && (ALL_PERMISSIONS as string[]).includes(key)) result[role].push(key as Permission);
  }
  for (const role of SEEDED_ROLES) if (role.fullAccess) result[role.key] = ALL_PERMISSIONS;
  return result;
}

export const SEEDED_ROLE_PERMISSIONS = parsePermissions();

export function seededUser(roleKey: string, overrides: Partial<CurrentUser> = {}): CurrentUser {
  const role = seededRole(roleKey);
  const branchless = role.scope !== "branch";
  const branchId = overrides.branchId !== undefined ? overrides.branchId : branchless ? null : "branch-1";
  return {
    id: `user-${role.key}`,
    name: `Test ${role.key}`,
    email: `${role.key}@satamoni.dev`,
    roles: [role.key],
    branchId,
    isActive: true,
    permissions: SEEDED_ROLE_PERMISSIONS[role.key],
    roleLabels: { [role.key]: role.label },
    companyWide: role.scope === "company",
    fullAccess: role.fullAccess,
    ...overrides,
  };
}
