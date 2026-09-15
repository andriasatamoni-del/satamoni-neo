import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importDriversFromLegacy } from "../../../scripts/import-drivers-from-legacy";
import { KyselyDriverRepository } from "../../../src/contexts/delivery/infrastructure/persistence/kysely-driver.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importDriversFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let driverRepo: KyselyDriverRepository;
  let branchId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS drivers");
    await legacyPool.query(`CREATE TABLE drivers (id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, status TEXT NOT NULL DEFAULT 'AVAILABLE')`);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    driverRepo = new KyselyDriverRepository(neoDb);

    const branchRepo = new KyselyBranchRepository(neoDb);
    const branch = Branch.register({ name: "فرع سائقين-fixture", legacyBranchId: 600 });
    await branchRepo.save(branch);
    branchId = branch.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM drivers");
    await sql`DELETE FROM drivers`.execute(neoDb);
  });

  test("بيستورد سائق جديد صح", async () => {
    await legacyPool.query(`INSERT INTO drivers (branch_id, name, phone, status) VALUES (600, 'سائق-fixture', '123', 'AVAILABLE')`);
    const result = await importDriversFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });

    const imported = (await driverRepo.list({ branchId }))[0];
    expect(imported.name).toBe("سائق-fixture");
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    const driver = await legacyPool.query(`INSERT INTO drivers (branch_id, name) VALUES (600, 'سائق-تاني-fixture') RETURNING id`);
    const first = await importDriversFromLegacy(legacyPool, neoDb);
    expect(first).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE drivers SET status = 'OFF_DUTY' WHERE id = $1`, [driver.rows[0].id]);
    const second = await importDriversFromLegacy(legacyPool, neoDb);
    expect(second).toEqual({ created: 0, updated: 1, skipped: 0 });

    const imported = (await driverRepo.list({ branchId }))[0];
    expect(imported.status).toBe("OFF_DUTY");
  });
});
