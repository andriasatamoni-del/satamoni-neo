import * as fs from "node:fs";
import * as tls from "node:tls";
import type { ConnectionOptions } from "node:tls";

// TLS للاتصال بقاعدة المصدر (قاعدة الإنتاج المُدارة، برّه الجهاز) من أدوات النسخ/الاسترجاع: pg_dump و"مقارنة الـdrill" و"بصمة السيرفر".
//
// الافتراضي **تحقق كامل** من الشهادة (سلسلة الثقة + اسم الـhost)، مش `rejectUnauthorized: false` اللي كان بيقبل أي شهادة (يعني أي حد
// في الطريق يقدر ينتحل السيرفر ويستلم كلمة سر القاعدة وبيانات النسخة).
//
//   BACKUP_DB_TLS_MODE=verify                 (الافتراضي) تحقق كامل.
//   BACKUP_DB_TLS_MODE=insecure-skip-verify   خروج صريح من التحقق (تشفير بدون هوية السيرفر). بيطبع تحذير. استخدمه مؤقتًا بس لو الشهادة
//                                             فعلًا مش قابلة للتحقق، وبعدين ثبّت الـCA واقفل الخروج ده.
//   RESTORE_DRILL_SOURCE_SSL_CA=<path.pem>    (اختياري) شهادة الـCA اللي بتثق فيها لقاعدة المصدر. لو متحددة، هي **الوحيدة** المقبولة (تثبيت)؛
//                                             لو لأ، بتتستخدم مخزن الـCA بتاع النظام (شهادة صادرة من CA عام).
//   PGSSLROOTCERT                             نفس الفكرة لـpg_dump (libpq). لو مش متحدد في وضع verify بنستخدم `system` (libpq 16+).
//
// المسار ده للنسخ الاحتياطي والاسترجاع بس. اتصال التطبيق نفسه (src/shared/database/pg-ssl.ts) ومهام الاستيراد لسه على السلوك القديم.
export class PgTlsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgTlsConfigError";
  }
}

export type SourceTlsMode = "verify" | "insecure-skip-verify";

export function sourceTlsMode(env: NodeJS.ProcessEnv = process.env): SourceTlsMode {
  const raw = (env.BACKUP_DB_TLS_MODE ?? "").trim();
  if (raw === "" || raw === "verify") return "verify";
  if (raw === "insecure-skip-verify") return "insecure-skip-verify";
  throw new PgTlsConfigError('BACKUP_DB_TLS_MODE must be "verify" (default) or "insecure-skip-verify"');
}

let warnedInsecure = false;
function warnInsecureOnce(): void {
  if (warnedInsecure) return;
  warnedInsecure = true;
  console.warn("WARNING: BACKUP_DB_TLS_MODE=insecure-skip-verify - the database connection is encrypted but the server certificate is NOT verified (man-in-the-middle possible). Pin the CA and remove this setting.");
}

// ملف CA لازم يكون شهادة PEM (مش مفتاح خاص بالغلط، ومش ملف فاضي)
export function readCaFile(file: string): string {
  let pem: string;
  try {
    pem = fs.readFileSync(file, "utf8");
  } catch {
    throw new PgTlsConfigError("the CA certificate file could not be read");
  }
  if (/PRIVATE KEY/.test(pem)) throw new PgTlsConfigError("the CA file contains a PRIVATE KEY - refusing to load it (give the CERTIFICATE only)");
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) throw new PgTlsConfigError("the CA file does not contain a PEM certificate");
  return pem;
}

// اسم/عنوان الـhost اللي بنتصل بيه، من رابط الاتصال (بدون أقواس IPv6)
export function hostOfConnectionString(connectionString: string): string {
  const host = new URL(connectionString).hostname.toLowerCase();
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

// خيار `ssl` لـnode-pg. لازم تبعت `host` الحقيقي: لما الـhost عنوان IP، node-pg بيعمل TLS على سوكيت جاهز من غير اسم، وNode بيرجع
// يتحقق من الشهادة مقابل "localhost" (اتأكدنا بالاختبار) بدل العنوان الحقيقي، فبنربط التحقق بالـhost الفعلي صراحةً.
export function sourceTlsOption(env: NodeJS.ProcessEnv = process.env, host?: string): ConnectionOptions {
  if (sourceTlsMode(env) === "insecure-skip-verify") {
    warnInsecureOnce();
    return { rejectUnauthorized: false };
  }
  const caFile = (env.RESTORE_DRILL_SOURCE_SSL_CA ?? "").trim();
  const base: ConnectionOptions = caFile ? { rejectUnauthorized: true, ca: readCaFile(caFile) } : { rejectUnauthorized: true };
  return host ? { ...base, checkServerIdentity: (_ignored: string, cert) => tls.checkServerIdentity(host, cert) } : base;
}

// متغيرات libpq لـpg_dump/pg_restore. verify-full = سلسلة الثقة + اسم الـhost (require بيشفّر بس ومبيتحققش من هوية السيرفر)
export function libpqSslEnv(env: NodeJS.ProcessEnv = process.env): { PGSSLMODE: string; PGSSLROOTCERT?: string } {
  if (sourceTlsMode(env) === "insecure-skip-verify") {
    warnInsecureOnce();
    return { PGSSLMODE: "require" };
  }
  const caFile = (env.PGSSLROOTCERT ?? env.RESTORE_DRILL_SOURCE_SSL_CA ?? "").trim();
  if (caFile && caFile !== "system") readCaFile(caFile);
  return { PGSSLMODE: "verify-full", PGSSLROOTCERT: caFile || "system" };
}
