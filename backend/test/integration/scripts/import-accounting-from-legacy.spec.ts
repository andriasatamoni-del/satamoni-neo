import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importAccountingFromLegacy } from "../../../scripts/import-accounting-from-legacy";
import { KyselyAccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importAccountingFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let accountRepo: KyselyAccountRepository;
  let branchRepo: KyselyBranchRepository;
  let branchId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS accounts");
    await legacyPool.query(`
      CREATE TABLE accounts (
        id SERIAL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, account_type TEXT NOT NULL,
        parent_account_id INTEGER, branch_id INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, is_system_account BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    accountRepo = new KyselyAccountRepository(neoDb);
    branchRepo = new KyselyBranchRepository(neoDb);
    await sql`DELETE FROM accounts`.execute(neoDb);

    const branch = Branch.register({ name: "فرع الاستيراد", legacyBranchId: 777 });
    await branchRepo.save(branch);
    branchId = branch.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM accounts`.execute(neoDb);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM accounts");
    await sql`DELETE FROM accounts`.execute(neoDb);
  });

  test("بيستورد حساب جديد صح", async () => {
    await legacyPool.query(
      `INSERT INTO accounts (code, name, account_type, is_system_account) VALUES ('1100', 'الكاش', 'ASSET', true)`
    );
    const result = await importAccountingFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, parentsLinked: 0 });

    const imported = await accountRepo.findByLegacyAccountId(1);
    expect(imported?.code).toBe("1100");
    expect(imported?.isSystemAccount).toBe(true);
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    await legacyPool.query(`INSERT INTO accounts (code, name, account_type) VALUES ('4100', 'مبيعات الطعام', 'REVENUE')`);
    const first = await importAccountingFromLegacy(legacyPool, neoDb);
    expect(first).toEqual({ created: 1, updated: 0, skipped: 0, parentsLinked: 0 });

    await legacyPool.query(`UPDATE accounts SET name = 'مبيعات الطعام المعدّلة' WHERE code = '4100'`);
    const second = await importAccountingFromLegacy(legacyPool, neoDb);
    expect(second).toEqual({ created: 0, updated: 1, skipped: 0, parentsLinked: 0 });

    const all = await accountRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("مبيعات الطعام المعدّلة");
  });

  test("بيربط parent_account_id وbranch_id صح لما يبقوا معروفين في النظام الجديد", async () => {
    const { rows: [{ id: parentLegacyId }] } = await legacyPool.query<{ id: number }>(
      `INSERT INTO accounts (code, name, account_type) VALUES ('4000', 'المبيعات', 'REVENUE') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO accounts (code, name, account_type, parent_account_id, branch_id) VALUES ('4100', 'مبيعات الطعام', 'REVENUE', $1, 777)`,
      [parentLegacyId]
    );

    const result = await importAccountingFromLegacy(legacyPool, neoDb);
    expect(result.created).toBe(2);
    expect(result.parentsLinked).toBe(1);

    const parent = await accountRepo.findByLegacyAccountId(parentLegacyId);
    const child = await accountRepo.findByLegacyAccountId(parentLegacyId + 1);
    expect(child?.parentAccountId).toBe(parent?.id);
    expect(child?.branchId).toBe(branchId);
  });
});
