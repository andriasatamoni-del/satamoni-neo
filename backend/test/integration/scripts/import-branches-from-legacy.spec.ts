import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importBranchesFromLegacy } from "../../../scripts/import-branches-from-legacy";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importBranchesFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let repo: KyselyBranchRepository;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS branches");
    await legacyPool.query(`
      CREATE TABLE branches (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, hours TEXT,
        lat NUMERIC, lng NUMERIC, is_central_kitchen BOOLEAN NOT NULL DEFAULT FALSE,
        supports_dine_in BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyBranchRepository(neoDb);
    await sql`DELETE FROM branches`.execute(neoDb);
  });

  afterAll(async () => {
    await legacyPool.end();
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM branches");
    await sql`DELETE FROM branches`.execute(neoDb);
  });

  test("بيستورد فرع جديد صح", async () => {
    await legacyPool.query(
      `INSERT INTO branches (name, address, is_central_kitchen) VALUES ('محرم بك', 'شارع 1', false)`
    );
    const result = await importBranchesFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0 });

    const imported = await repo.findByLegacyBranchId(1);
    expect(imported?.name).toBe("محرم بك");
    expect(imported?.address).toBe("شارع 1");
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    await legacyPool.query(`INSERT INTO branches (name) VALUES ('فرع أ')`);
    const first = await importBranchesFromLegacy(legacyPool, neoDb);
    expect(first).toEqual({ created: 1, updated: 0 });

    await legacyPool.query(`UPDATE branches SET name = 'فرع أ بعد التعديل' WHERE name = 'فرع أ'`);
    const second = await importBranchesFromLegacy(legacyPool, neoDb);
    expect(second).toEqual({ created: 0, updated: 1 });

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("فرع أ بعد التعديل");
  });
});
