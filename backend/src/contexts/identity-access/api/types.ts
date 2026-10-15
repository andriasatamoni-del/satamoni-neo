// شكل المستخدم المرفق على الـrequest بعد ما JwtAuthGuard يتحقق منه - بيتقرا من قاعدة البيانات في كل
// طلب (مش من التوكن نفسه) عشان أي تغيير في الأدوار/الصلاحيات/is_active يتفعّل فورًا من غير ما ينتظر
// التوكن ينتهي، نفس فلسفة requireAuth في الريبو القديم بالظبط.
import type { Role } from "../domain/role";
import type { Permission } from "../domain/permission";

export interface AuthenticatedUser {
  id: string;
  roles: readonly Role[];
  branchId: string | null;
  permissions: ReadonlySet<Permission>;
}
