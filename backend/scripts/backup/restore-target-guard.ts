import { Client } from "pg";

// حواجز أمان لتمرين الاسترجاع (restore-drill). التمرين بيعمل CREATE DATABASE + pg_restore + migrateToLatest + DROP DATABASE،
// فلازم يتأكد قبل أي اتصال إن الوجهة سيرفر محلي مؤقت، وإنها مش نفس سيرفر أي قاعدة "مصدر" (إنتاج/ستيجينج/legacy).
//
// الفحص بيتم على القيمة النهائية (بعد أي مصدر بيئة)، فمفيش طريقة لتجاوزه بـ.env أو بمتغير بيئة تاني. ومفيش مقارنة نصية بسيطة:
// بنحلّل الرابط (WHATWG URL) ونطبّع host (حروف صغيرة، أقواس IPv6، نقطة آخر الاسم) وport (الافتراضي 5432)، ونقارن على مستوى
// **السيرفر** مش اسم القاعدة. وبعدين فحص وقت التشغيل ببصمة السيرفر (pg_postmaster_start_time) بيكشف نفس السيرفر حتى لو
// وصلنا له بأسماء مختلفة (alias DNS، tunnel، port-forward) اللي المقارنة النصية مبتشوفهاش.
//
// الرسائل مبتطبعش الرابط ولا host ولا port ولا الباسورد أبدًا (اللوجات ممكن تبقى عامة): بنقول بس إيه القاعدة اللي اتكسرت.
// مفيش dotenv هنا ولا في restore-drill.ts عمدًا: `backend/.env` عمره ما بيتقرا في مسار الاسترجاع.

export class RestoreGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreGuardError";
  }
}

export interface PgEndpoint {
  host: string;
  port: number;
  database: string;
  loopback: boolean;
  // مفتاح السيرفر: كل عناوين الـloopback (localhost / 127.x.x.x / ::1) نفس الجهاز، فبتتطابق لو نفس الـport
  serverKey: string;
}

// معاملات في الرابط بتغيّر السيرفر/القاعدة الفعلية اللي بيوصل لها libpq/node-pg (بتتخطّى host/port اللي في الرابط)
const FORBIDDEN_QUERY_PARAMS = ["host", "hostaddr", "port", "service", "servicefile", "dbname", "database"];

const IPV4_LOOPBACK = /^127(?:\.(?:0|[1-9]\d{0,2})){3}$/;

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  if (!IPV4_LOOPBACK.test(host)) return false;
  return host.split(".").every((octet) => Number(octet) <= 255);
}

export function normalizePgUrl(raw: string | undefined | null, label: string): PgEndpoint {
  if (typeof raw !== "string" || raw.trim() === "") throw new RestoreGuardError(`${label} is empty or missing`);
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new RestoreGuardError(`${label} is not a valid PostgreSQL URL`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new RestoreGuardError(`${label} must use the postgres:// or postgresql:// scheme`);
  }
  for (const param of FORBIDDEN_QUERY_PARAMS) {
    if (url.searchParams.has(param)) throw new RestoreGuardError(`${label} must not override the connection target through the "${param}" query parameter`);
  }

  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  // اسم مضمّن فيه % (percent-encoding: node-pg بيفكّه) أو فاصلة (أكتر من host) أو مسافة: مبنفترضش نيّة، بنرفض
  if (host === "" || /[%,\s/\\]/.test(host)) throw new RestoreGuardError(`${label} has no explicit, unambiguous host (unix sockets and multi-host URLs are not accepted)`);

  const port = url.port === "" ? 5432 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RestoreGuardError(`${label} has an invalid port`);

  let database = "";
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new RestoreGuardError(`${label} has an invalid database name`);
  }

  const loopback = isLoopbackHost(host);
  return { host, port, database, loopback, serverKey: loopback ? `loopback:${port}` : `${host}:${port}` };
}

// الوجهة لازم تكون سيرفر محلي (loopback) - قواعد بعيدة مرفوضة. دعم قواعد بعيدة مستقبلًا = تصميم منفصل (docs/RESTORE_DRILL_REMOTE_TARGET_DESIGN.md)
export function assertLocalRestoreTarget(raw: string | undefined | null, label = "RESTORE_DRILL_DATABASE_URL"): PgEndpoint {
  const target = normalizePgUrl(raw, label);
  if (!target.loopback) {
    throw new RestoreGuardError(
      `${label} must point to a LOCAL throw-away PostgreSQL server (localhost, 127.0.0.0/8 or ::1). Remote restore targets are refused`
    );
  }
  return target;
}

export interface SourceRef {
  label: string;
  url: string | undefined | null;
}

// أي مصدر معرّف (حتى لو الرابط بتاعه تالف) لازم يتفحص - رابط مش مفهوم = رفض (fail closed)، مش تجاهل
export function assertNotSameServer(target: PgEndpoint, sources: SourceRef[]): void {
  for (const source of sources) {
    if (source.url === undefined || source.url === null || source.url.trim() === "") continue;
    const endpoint = normalizePgUrl(source.url, source.label);
    if (endpoint.serverKey === target.serverKey) {
      throw new RestoreGuardError(
        `the restore target is on the same server as ${source.label} (a different database name does not make it a different server). Use a separate throw-away server`
      );
    }
  }
}

// بصمة السيرفر: وقت تشغيل الـpostmaster بدقة microseconds + رقم النسخة. أي اتصال لنفس السيرفر (أي اسم/port/tunnel) بيرجّع نفس البصمة.
export async function clusterFingerprint(connectionString: string, opts: { ssl?: boolean } = {}): Promise<string> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
  });
  client.on("error", () => undefined);
  await client.connect();
  try {
    const res = await client.query(
      "SELECT extract(epoch FROM pg_postmaster_start_time())::text AS started, current_setting('server_version_num') AS version"
    );
    return `${res.rows[0].started}|${res.rows[0].version}`;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export type FingerprintFn = (connectionString: string, opts?: { ssl?: boolean }) => Promise<string>;

// فحص وقت التشغيل: لو أي مصدر وصلنا له (اتصال ناجح) ليه نفس بصمة سيرفر الوجهة => نفس السيرفر => رفض.
// مصدر مش قادرين نوصله مش ممكن يبقى نفس السيرفر الشغّال اللي وصلنا له للوجهة، فبنتخطاه (ومعاه تحذير في السجل).
export async function assertDifferentCluster(
  targetUrl: string,
  sources: SourceRef[],
  opts: { sourceSsl?: boolean; fingerprint?: FingerprintFn; warn?: (message: string) => void } = {}
): Promise<void> {
  const fingerprint = opts.fingerprint ?? clusterFingerprint;
  const defined = sources.filter((s) => s.url && s.url.trim() !== "");
  if (defined.length === 0) return;
  const targetPrint = await fingerprint(targetUrl);
  for (const source of defined) {
    let sourcePrint: string;
    try {
      sourcePrint = await fingerprint(source.url as string, { ssl: opts.sourceSsl });
    } catch {
      opts.warn?.(`could not connect to ${source.label} to compare server identity - skipped (it cannot be the running target server)`);
      continue;
    }
    if (sourcePrint === targetPrint) {
      throw new RestoreGuardError(`the restore target and ${source.label} are the same PostgreSQL server (detected at connection time). Use a separate throw-away server`);
    }
  }
}

export interface RestoreDrillConfig {
  targetUrl: string;
  target: PgEndpoint;
  sources: SourceRef[];
}

// بيقرا إعداد التمرين من بيئة العملية (بس): وجهة إلزامية بدون fallback لـDATABASE_URL، ومصادر الحماية من التعارض
export function resolveRestoreDrillConfig(env: NodeJS.ProcessEnv): RestoreDrillConfig {
  const targetUrl = env.RESTORE_DRILL_DATABASE_URL;
  if (targetUrl === undefined || targetUrl.trim() === "") {
    throw new RestoreGuardError(
      "RESTORE_DRILL_DATABASE_URL is required. There is NO fallback to DATABASE_URL: the restore drill must never default to the application database"
    );
  }
  const target = assertLocalRestoreTarget(targetUrl);
  const sources: SourceRef[] = [
    { label: "DATABASE_URL", url: env.DATABASE_URL },
    { label: "LEGACY_DATABASE_URL", url: env.LEGACY_DATABASE_URL },
    { label: "RESTORE_DRILL_COMPARE_SOURCE_URL", url: env.RESTORE_DRILL_COMPARE_SOURCE_URL },
  ];
  assertNotSameServer(target, sources);
  return { targetUrl: targetUrl.trim(), target, sources };
}
