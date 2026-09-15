// نفس الأدوار السبعة بالظبط من db/schema.sql (users.role CHECK) في الريبو القديم - مفيش دور جديد
// ولا محذوف، ده تحويل مباشر للسلوك الحالي مش إعادة تصميم لنظام الأدوار نفسه.
export const ROLES = [
  "admin",
  "branch_manager",
  "accountant",
  "cashier",
  "callcenter",
  "driver",
  "employee",
] as const;

export type Role = (typeof ROLES)[number];

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
