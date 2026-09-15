import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importUsersFromLegacy } from "../../../scripts/import-users-from-legacy";
import { KyselyUserRepository } from "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";

// قاعدة وهمية بشكل جدول users القديم بالظبط (مفيش داعي نجيب الريبو القديم الحقيقي هنا - النص المتفق
// عليه هو الأعمدة، مش القاعدة كلها) - راجع خطة إعادة البناء §7: "الاستيراد بيتجرب على نسخة من
// بيانات الريبو القديم الأول"
const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importUsersFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let repo: KyselyUserRepository;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS users");
    await legacyPool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        pin_hash TEXT,
        permission_grants JSONB NOT NULL DEFAULT '[]',
        permission_revokes JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyUserRepository(neoDb);
  });

  afterAll(async () => {
    await legacyPool.end();
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM users");
    await sql`DELETE FROM users`.execute(neoDb);
  });

  test("بيستورد يوزر جديد صح بكل بياناته", async () => {
    await legacyPool.query(
      `INSERT INTO users (branch_id, name, email, password_hash, role, pin_hash, permission_grants, permission_revokes, is_active)
       VALUES (5, 'أحمد', 'ahmed-import@legacy.test', 'bcrypt-hash-here', 'cashier', 'pin-hash', '["orders.cancel"]', '["shifts.open_own"]', true)`
    );

    const result = await importUsersFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });

    const imported = await repo.findByEmail("ahmed-import@legacy.test");
    expect(imported).not.toBeNull();
    expect(imported!.name).toBe("أحمد");
    expect(imported!.role).toBe("cashier");
    expect(imported!.passwordHash).toBe("bcrypt-hash-here");
    expect(imported!.pinHash).toBe("pin-hash");
    expect(imported!.permissionGrants).toEqual(["orders.cancel"]);
    expect(imported!.permissionRevokes).toEqual(["shifts.open_own"]);
    expect(imported!.branchId).toBeNull(); // لسه مفيش Branches context - راجع تعليق الملف
    expect(imported!.legacyUserId).not.toBeNull();
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    await legacyPool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ('سارة', 'sara-import@legacy.test', 'hash1', 'branch_manager', true)`
    );

    const first = await importUsersFromLegacy(legacyPool, neoDb);
    expect(first).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE users SET password_hash = 'hash2', role = 'admin' WHERE email = 'sara-import@legacy.test'`);

    const second = await importUsersFromLegacy(legacyPool, neoDb);
    expect(second).toEqual({ created: 0, updated: 1, skipped: 0 });

    const all = await repo.list();
    expect(all.filter((u) => u.email === "sara-import@legacy.test").length).toBe(1);
    const updatedUser = await repo.findByEmail("sara-import@legacy.test");
    expect(updatedUser!.passwordHash).toBe("hash2");
    expect(updatedUser!.role).toBe("admin");
  });

  test("صف بدور غير معروف بيتخطّى من غير ما يوقف باقي الاستيراد", async () => {
    await legacyPool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active) VALUES
       ('صحيح', 'valid-import@legacy.test', 'h', 'cashier', true),
       ('غريب', 'ghost-import@legacy.test', 'h', 'super_owner', true)`
    );

    const result = await importUsersFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(await repo.findByEmail("valid-import@legacy.test")).not.toBeNull();
    expect(await repo.findByEmail("ghost-import@legacy.test")).toBeNull();
  });

  test("حساب معطّل (is_active=false) بيتستورد بنفس الحالة", async () => {
    await legacyPool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ('معطّل', 'inactive-import@legacy.test', 'h', 'cashier', false)`
    );
    await importUsersFromLegacy(legacyPool, neoDb);
    const imported = await repo.findByEmail("inactive-import@legacy.test");
    expect(imported!.isActive).toBe(false);
  });
});
