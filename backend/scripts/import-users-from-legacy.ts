// NEO-5: استيراد مستخدمين من الريبو القديم (satamoni-backend) لقاعدة satamoni-neo الجديدة.
// اتصال قراءة فقط بقاعدة الريبو القديم (LEGACY_DATABASE_URL) - مفيش أي INSERT/UPDATE هناك خالص.
// قابل لإعادة التشغيل بأمان (idempotent): كل صف بيتربط بمصدره عن طريق legacy_user_id - لو الصف
// موجود بالفعل من تشغيلة قبل كده، بيتحدّث مش يتكرر. راجع خطة إعادة البناء قسم 4.
//
// هاش الباسورد (bcryptjs) والـPIN متوافقين حرفيًا بين النظامين (نفس المكتبة، نفس الطريقة) - مفيش
// داعي لإعادة تعيين باسورد إجباري زي ما الخطة افترضت كاحتياط، بننقل الـhash زي ما هو.
//
// branch_id: النظام الجديد لسه مفيهوش Bounded Context اسمه "الفروع" (لسه معمول بس Identity & Access +
// CRM قريب - راجع خطة إعادة البناء §5). فبنسيب branch_id فاضي (NULL) لكل المستخدمين المستوردين دلوقتي -
// لما الـcontext ده يتبني، هيتعمل backfill من legacy_user_id -> الريبو القديم (لسه موجود كمرجع) تاني.
import "dotenv/config";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { User } from "../src/contexts/identity-access/domain/user.aggregate";
import { isValidRole } from "../src/contexts/identity-access/domain/role";

interface LegacyUserRow {
  id: number;
  branch_id: number | null;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  pin_hash: string | null;
  permission_grants: unknown;
  permission_revokes: unknown;
  is_active: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// الجزء القابل للاختبار - بياخد اتصالات جاهزة (بدل ما يفتحها هو) عشان الاختبارات تقدر تبعتله
// قواعد بيانات وهمية (fixtures) من غير الحاجة للريبو القديم الحقيقي
export async function importUsersFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ImportResult> {
  const repo = new KyselyUserRepository(neoDb);
  const { rows } = await legacyPool.query<LegacyUserRow>(
    `SELECT id, branch_id, name, email, password_hash, role, pin_hash,
            permission_grants, permission_revokes, is_active
     FROM users ORDER BY id`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!isValidRole(row.role)) {
      console.warn(`⚠ تخطّي المستخدم #${row.id} (${row.email}) - دور غير معروف: ${row.role}`);
      skipped++;
      continue;
    }

    const existing = await repo.findByLegacyUserId(row.id);
    const grants = asStringArray(row.permission_grants);
    const revokes = asStringArray(row.permission_revokes);

    if (existing) {
      existing.changeRole(row.role);
      existing.setPasswordHash(row.password_hash);
      existing.setPinHash(row.pin_hash);
      existing.setPermissionOverrides(grants, revokes);
      if (row.is_active) existing.activate();
      else existing.deactivate();
      await repo.save(existing);
      updated++;
    } else {
      const user = User.register({
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role,
        legacyUserId: row.id,
      });
      user.setPinHash(row.pin_hash);
      user.setPermissionOverrides(grants, revokes);
      if (!row.is_active) user.deactivate();
      await repo.save(user);
      created++;
    }
  }

  return { created, updated, skipped };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importUsersFromLegacy(legacyPool, neoDb);
  console.log(`✅ الاستيراد خلص: ${result.created} جديد، ${result.updated} اتحدّث، ${result.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
