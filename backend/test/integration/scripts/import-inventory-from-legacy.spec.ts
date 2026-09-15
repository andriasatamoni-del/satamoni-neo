import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importInventoryFromLegacy } from "../../../scripts/import-inventory-from-legacy";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyStockMovementRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importInventoryFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let itemRepo: KyselyInventoryItemRepository;
  let movementRepo: KyselyStockMovementRepository;
  let branchId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS inventory_items, branch_inventory_stock");
    await legacyPool.query(`
      CREATE TABLE inventory_items (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, unit_cost NUMERIC,
        item_type TEXT NOT NULL DEFAULT 'raw', negative_stock_policy TEXT NOT NULL DEFAULT 'STRICT'
      )
    `);
    await legacyPool.query(`
      CREATE TABLE branch_inventory_stock (
        branch_id INTEGER NOT NULL, inventory_item_id INTEGER NOT NULL, quantity NUMERIC NOT NULL DEFAULT 0
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    itemRepo = new KyselyInventoryItemRepository(neoDb);
    movementRepo = new KyselyStockMovementRepository(neoDb);
    const branchRepo = new KyselyBranchRepository(neoDb);

    await sql`DELETE FROM branch_stock_balances`.execute(neoDb);
    await sql`DELETE FROM stock_movements`.execute(neoDb);
    await sql`DELETE FROM inventory_items`.execute(neoDb);

    const branch = Branch.register({ name: "فرع استيراد مخزون-جست", legacyBranchId: 700 });
    await branchRepo.save(branch);
    branchId = branch.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM branch_inventory_stock; DELETE FROM inventory_items");
    await sql`DELETE FROM branch_stock_balances`.execute(neoDb);
    await sql`DELETE FROM stock_movements`.execute(neoDb);
    await sql`DELETE FROM inventory_items`.execute(neoDb);
  });

  test("بيستورد صنف ورصيد افتتاحي مرتبط بيه صح", async () => {
    const itemRow = await legacyPool.query(
      `INSERT INTO inventory_items (name, unit, unit_cost, item_type) VALUES ('دقيق-fixture', 'كيلو', 25, 'raw') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO branch_inventory_stock (branch_id, inventory_item_id, quantity) VALUES (700, $1, 42.5)`,
      [itemRow.rows[0].id]
    );

    const result = await importInventoryFromLegacy(legacyPool, neoDb);
    expect(result.items).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.openingBalances).toEqual({ created: 1, updated: 0, skipped: 0 });

    const item = await itemRepo.findByLegacyInventoryItemId(itemRow.rows[0].id);
    expect(item?.name).toBe("دقيق-fixture");
    expect(await movementRepo.getBalance(branchId, item!.id)).toBe(42.5);
  });

  test("تشغيلة تانية بنفس البيانات - الصنف بيتحدّث والرصيد الافتتاحي متكررش (idempotent)", async () => {
    const itemRow = await legacyPool.query(
      `INSERT INTO inventory_items (name, unit) VALUES ('سكر-fixture', 'كيلو') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO branch_inventory_stock (branch_id, inventory_item_id, quantity) VALUES (700, $1, 10)`,
      [itemRow.rows[0].id]
    );

    const first = await importInventoryFromLegacy(legacyPool, neoDb);
    expect(first.openingBalances).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE inventory_items SET unit_cost = 99 WHERE id = $1`, [itemRow.rows[0].id]);
    const second = await importInventoryFromLegacy(legacyPool, neoDb);
    expect(second.items).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.openingBalances).toEqual({ created: 0, updated: 1, skipped: 0 }); // موجود بالفعل، مش اتكرر

    const item = await itemRepo.findByLegacyInventoryItemId(itemRow.rows[0].id);
    expect(item?.unitCost).toBe(99);
    // الرصيد لسه 10 - مش 20 (مفيش تكرار لحركة الرصيد الافتتاحي)
    expect(await movementRepo.getBalance(branchId, item!.id)).toBe(10);
  });

  test("رصيد افتتاحي لصنف غير مستورد (نوع غير معروف) بيتخطّى من غير ما يوقف الباقي", async () => {
    const validItem = await legacyPool.query(
      `INSERT INTO inventory_items (name, unit) VALUES ('صحيح-fixture', 'كيلو') RETURNING id`
    );
    const ghostItem = await legacyPool.query(
      `INSERT INTO inventory_items (name, unit, item_type) VALUES ('غريب-fixture', 'كيلو', 'ghost_type') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO branch_inventory_stock (branch_id, inventory_item_id, quantity) VALUES (700, $1, 5), (700, $2, 5)`,
      [validItem.rows[0].id, ghostItem.rows[0].id]
    );

    const result = await importInventoryFromLegacy(legacyPool, neoDb);
    expect(result.items).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(result.openingBalances).toEqual({ created: 1, updated: 0, skipped: 1 });
  });
});
