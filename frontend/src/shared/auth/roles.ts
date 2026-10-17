import type { Permission } from "./permissions";

// الأدوار السبعة - نسخة مطابقة لـbackend/src/contexts/identity-access/domain/role.ts (المصدر الأساسي).
// لو ضفت أو شيلت دور هنا لازم تعدّله هناك كمان: backend/test/unit/identity-access/roles-sync.spec.ts بيفشل لو اختلفوا.
export const ROLE = {
  ADMIN: "admin",
  BRANCH_MANAGER: "branch_manager",
  ACCOUNTANT: "accountant",
  CASHIER: "cashier",
  CALLCENTER: "callcenter",
  DRIVER: "driver",
  EMPLOYEE: "employee",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLES = Object.values(ROLE) as Role[];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "أدمن",
  branch_manager: "مدير فرع",
  accountant: "محاسب",
  cashier: "كاشير",
  callcenter: "كول سنتر",
  driver: "سائق",
  employee: "موظف",
};

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

export function hasRole(user: { roles: readonly Role[] } | null | undefined, ...wanted: Role[]): boolean {
  return !!user && wanted.some((r) => user.roles.includes(r));
}

// أي صلاحية واحدة من اللي متبعتة كفاية - نفس معنى @RequirePermission(...keys) في الباك.
// can(user) من غير مفاتيح = false (مفيش حاجة تتسمح من غير مفتاح صريح).
export function can(user: { permissions: readonly Permission[] } | null | undefined, ...permissions: Permission[]): boolean {
  return !!user && permissions.some((p) => user.permissions.includes(p));
}

export function roleLabels(roles: readonly Role[]): string {
  return roles.map((r) => ROLE_LABELS[r] ?? r).join("، ");
}

// نفس branchScopeOf في الباك (backend/src/shared/authorization/branch-scope.ts): الأدمن والمحاسب على مستوى الشركة،
// والكول سنتر بس لو مالوش فرع. اللي غيرهم مربوط بفرعه، فالـendpoints اللي عليها @CompanyWideOnly() بترجعله 403.
export function isCompanyWide(user: { roles: readonly Role[]; branchId?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (hasRole(user, ROLE.ADMIN, ROLE.ACCOUNTANT)) return true;
  return hasRole(user, ROLE.CALLCENTER) && !user.branchId;
}
