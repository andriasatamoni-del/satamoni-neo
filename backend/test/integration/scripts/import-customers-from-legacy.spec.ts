import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importCustomersFromLegacy } from "../../../scripts/import-customers-from-legacy";
import { KyselyCustomerRepository } from "../../../src/contexts/customers/infrastructure/persistence/kysely-customer.repository";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importCustomersFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let repo: KyselyCustomerRepository;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS customer_addresses, customers");
    await legacyPool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY, phone TEXT NOT NULL UNIQUE, phone2 TEXT, name TEXT, address_details TEXT,
        distinguishing_mark TEXT, notes TEXT, loyalty_points INTEGER NOT NULL DEFAULT 0, password_hash TEXT,
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE, block_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await legacyPool.query(`
      CREATE TABLE customer_addresses (
        id SERIAL PRIMARY KEY, customer_phone TEXT NOT NULL, label TEXT, address_details TEXT NOT NULL,
        distinguishing_mark TEXT, is_default BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    repo = new KyselyCustomerRepository(neoDb);
    await sql`DELETE FROM customer_addresses`.execute(neoDb);
    await sql`DELETE FROM customers`.execute(neoDb);
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM customer_addresses`.execute(neoDb);
    await sql`DELETE FROM customers`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM customer_addresses");
    await legacyPool.query("DELETE FROM customers");
    await sql`DELETE FROM customer_addresses`.execute(neoDb);
    await sql`DELETE FROM customers`.execute(neoDb);
  });

  test("بيستورد عميل بحساب حقيقي (password_hash موجود) + عنوان محفوظ", async () => {
    await legacyPool.query(
      `INSERT INTO customers (phone, name, loyalty_points, password_hash) VALUES ('01011112222', 'عميل-استيراد-جست', 40, '$2a$10$abcdefghijklmnopqrstuv')`
    );
    await legacyPool.query(
      `INSERT INTO customer_addresses (customer_phone, label, address_details, is_default) VALUES ('01011112222', 'البيت', 'شارع 1', true)`
    );

    const result = await importCustomersFromLegacy(legacyPool, neoDb);
    expect(result.customers).toEqual({ created: 1, updated: 0, skipped: 0 });

    const imported = await repo.findByLegacyCustomerId(1);
    expect(imported?.name).toBe("عميل-استيراد-جست");
    expect(imported?.loyaltyPoints).toBe(40);
    expect(imported?.hasAccount).toBe(true);
    expect(imported?.passwordHash).toBe("$2a$10$abcdefghijklmnopqrstuv");
    expect(imported?.addresses).toHaveLength(1);
    expect(imported?.addresses[0].addressDetails).toBe("شارع 1");
  });

  test("عميل ضيف (password_hash=NULL) بيتسجّل من غير حساب", async () => {
    const {
      rows: [{ id: legacyId }],
    } = await legacyPool.query<{ id: number }>(
      `INSERT INTO customers (phone, name, loyalty_points) VALUES ('01033334444', 'ضيف-استيراد-جست', 5) RETURNING id`
    );
    const result = await importCustomersFromLegacy(legacyPool, neoDb);
    expect(result.customers).toEqual({ created: 1, updated: 0, skipped: 0 });

    const imported = await repo.findByLegacyCustomerId(legacyId);
    expect(imported?.hasAccount).toBe(false);
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    const {
      rows: [{ id: legacyId }],
    } = await legacyPool.query<{ id: number }>(
      `INSERT INTO customers (phone, name) VALUES ('01055556666', 'عميل-قبل-التعديل-جست') RETURNING id`
    );
    const first = await importCustomersFromLegacy(legacyPool, neoDb);
    expect(first.customers).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE customers SET name = 'عميل-بعد-التعديل-جست' WHERE phone = '01055556666'`);
    const second = await importCustomersFromLegacy(legacyPool, neoDb);
    expect(second.customers).toEqual({ created: 0, updated: 1, skipped: 0 });

    const imported = await repo.findByLegacyCustomerId(legacyId);
    expect(imported?.name).toBe("عميل-بعد-التعديل-جست");
  });
});
