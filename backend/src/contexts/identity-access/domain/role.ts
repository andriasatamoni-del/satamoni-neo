// نفس الأدوار السبعة بالظبط من db/schema.sql (users.role CHECK) في الريبو القديم - مفيش دور جديد
// ولا محذوف، ده تحويل مباشر للسلوك الحالي مش إعادة تصميم لنظام الأدوار نفسه.
// ده المصدر الوحيد للأدوار في الباك: الـCHECK بتاع users.role في identity-access.tables.ts بيتبني منه،
// ونسخة الفرونت (frontend/src/shared/auth/roles.ts) لازم تفضل مطابقة - test/unit/identity-access/roles-sync.spec.ts بيتأكد.
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

// Tuple type so Drizzle's text({ enum }) and class-validator's IsIn accept it directly.
export const ROLES = Object.values(ROLE) as [Role, ...Role[]];

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasAnyRole(roles: readonly Role[], ...wanted: Role[]): boolean {
  return wanted.some((r) => roles.includes(r));
}
