// سكريبت مرة واحدة: بينشئ (أو بيحدّث الباسورد لـ) مستخدم أدمن تجريبي في قاعدة الإنتاج - محتاج علشان
// نتأكد إن تسجيل الدخول شغال فعليًا على الاستضافة الحقيقية (DEPLOYMENT.md §5) قبل الاستيراد النهائي.
// idempotent: لو الإيميل موجود بالفعل، بيحدّث الباسورد بس (مش بينشئ صف تاني).
import "dotenv/config";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import type { Database } from "../src/shared/database/database.types";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { BcryptPasswordHasher } from "../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher";
import { User } from "../src/contexts/identity-access/domain/user.aggregate";

const TEST_ADMIN_EMAIL = "admin-test@satamoni-neo.local";
const TEST_ADMIN_PASSWORD = "Test12345!";

async function main() {
  const neoUrl = process.env.DATABASE_URL;
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const neoDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }),
  });
  const users = new KyselyUserRepository(neoDb);
  const hasher = new BcryptPasswordHasher();
  const passwordHash = await hasher.hash(TEST_ADMIN_PASSWORD);

  const existing = await users.findByEmail(TEST_ADMIN_EMAIL);
  if (existing) {
    existing.setPasswordHash(passwordHash);
    await users.save(existing);
    console.log(`✅ تحديث الباسورد لمستخدم موجود: ${TEST_ADMIN_EMAIL}`);
  } else {
    const admin = User.register({
      name: "أدمن تجريبي",
      email: TEST_ADMIN_EMAIL,
      passwordHash,
      role: "admin",
    });
    await users.save(admin);
    console.log(`✅ اتنشأ مستخدم أدمن تجريبي جديد: ${TEST_ADMIN_EMAIL}`);
  }
  console.log(`   الباسورد: ${TEST_ADMIN_PASSWORD}`);

  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل:", err.message);
    process.exit(1);
  });
}
