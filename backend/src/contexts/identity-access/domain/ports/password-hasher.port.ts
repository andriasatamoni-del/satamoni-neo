// الدومين بيعرّف الواجهة (port) - التطبيق الفعلي (bcrypt) في طبقة infrastructure. كده منطق الدومين
// (زي قاعدة "لازم كلمة السر تتقارن آمن") مايعرفش حاجة عن bcrypt بالتحديد.
export interface PasswordHasherPort {
  hash(plainText: string): Promise<string>;
  compare(plainText: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
