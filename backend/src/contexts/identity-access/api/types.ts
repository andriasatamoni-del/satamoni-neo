// شكل المستخدم المرفق على الـrequest بعد ما JwtAuthGuard يتحقق منه - بيتقرا من قاعدة البيانات في كل
// طلب (مش من التوكن نفسه) عشان أي تغيير في الدور/الصلاحيات/is_active يتفعّل فورًا من غير ما ينتظر
// التوكن ينتهي، نفس فلسفة requireAuth في الريبو القديم بالظبط.
import type { Role } from "../domain/role";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  branchId: string | null;
  permissionGrants: string[];
  permissionRevokes: string[];
}
