// بريد المستخدم النظامي اللي بينفّذ كل عملية مزامنة/إلغاء Talabat داخليًا (createdBy على الطلب) - نفس
// مفهوم talabat-integration@system.internal بالريبو القديم بالظبط (راجع migration 044، is_active=false
// عشان محدش يقدر يسجّل دخول بيه حتى لو خمّن كلمة السر العشوائية).
export const TALABAT_SYSTEM_USER_EMAIL = "talabat-integration@system.internal";
