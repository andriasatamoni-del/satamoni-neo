import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importOrdersFromLegacy } from "../../../scripts/import-orders-from-legacy";
import { KyselyOrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyStockMovementRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importOrdersFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let orderRepo: KyselyOrderRepository;
  let movementRepo: KyselyStockMovementRepository;
  let branchId: string;
  let menuItemId: string;
  let variantId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS order_items, orders");
    await legacyPool.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY, branch_id INTEGER, order_type TEXT NOT NULL, table_number TEXT,
        customer_name TEXT, customer_phone TEXT, address_details TEXT,
        subtotal NUMERIC NOT NULL DEFAULT 0, discount NUMERIC NOT NULL DEFAULT 0, total NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'preparing', kitchen_status TEXT NOT NULL DEFAULT 'NEW',
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await legacyPool.query(`
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, item_id INTEGER, variant_id INTEGER, combo_id INTEGER,
        quantity INTEGER NOT NULL, unit_price NUMERIC NOT NULL, line_total NUMERIC NOT NULL
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    orderRepo = new KyselyOrderRepository(neoDb);
    movementRepo = new KyselyStockMovementRepository(neoDb);

    const branchRepo = new KyselyBranchRepository(neoDb);
    const branch = Branch.register({ name: "فرع طلبات-fixture", legacyBranchId: 800 });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(neoDb);
    const item = MenuItem.register({ name: "بيتزا-طلبات-fixture", legacyMenuItemId: 850 });
    const variant = item.addVariant({ label: "وسط", price: 90, legacyVariantId: 851 });
    await menuItemRepo.save(item);
    menuItemId = item.id;
    variantId = variant.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM menu_item_variants WHERE item_id = ${menuItemId}`.execute(neoDb);
    await sql`DELETE FROM menu_items WHERE id = ${menuItemId}`.execute(neoDb);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM order_items; DELETE FROM orders");
    await sql`DELETE FROM print_jobs`.execute(neoDb);
    await sql`DELETE FROM order_items`.execute(neoDb);
    await sql`DELETE FROM orders`.execute(neoDb);
  });

  test("بيستورد طلب تاريخي كامل من غير ما يرحّل أي حركة مخزون جديدة", async () => {
    const order = await legacyPool.query(
      `INSERT INTO orders (branch_id, order_type, subtotal, total, status, kitchen_status)
       VALUES (800, 'takeaway', 90, 90, 'completed', 'READY') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO order_items (order_id, item_id, variant_id, quantity, unit_price, line_total)
       VALUES ($1, 850, 851, 1, 90, 90)`,
      [order.rows[0].id]
    );

    const result = await importOrdersFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });

    const imported = await orderRepo.findByLegacyOrderId(order.rows[0].id);
    expect(imported?.status).toBe("completed");
    expect(imported?.items).toHaveLength(1);
    expect(imported?.items[0].variantId).toBe(variantId);
    expect(imported?.total).toBe(90);

    // مفيش حركة مخزون اتسجّلت من الاستيراد - حتى لو الصنف ده كان له وصفة
    expect(await movementRepo.listMovements({ branchId })).toHaveLength(0);
  });

  test("تشغيلة تانية - الطلب مبيتكررش (idempotent)", async () => {
    const order = await legacyPool.query(
      `INSERT INTO orders (branch_id, order_type, subtotal, total, status, kitchen_status) VALUES (800, 'dinein', 50, 50, 'completed', 'READY') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO order_items (order_id, item_id, variant_id, quantity, unit_price, line_total) VALUES ($1, 850, 851, 1, 50, 50)`,
      [order.rows[0].id]
    );
    const first = await importOrdersFromLegacy(legacyPool, neoDb);
    expect(first.created).toBe(1);

    const second = await importOrdersFromLegacy(legacyPool, neoDb);
    expect(second).toEqual({ created: 0, updated: 1, skipped: 0 });

    const all = await orderRepo.list({ branchId });
    expect(all).toHaveLength(1);
  });

  test("طلب ببند كومبو بيتخطّى البند ده (الكومبوهات مش مدعومة لسه)", async () => {
    const order = await legacyPool.query(
      `INSERT INTO orders (branch_id, order_type, subtotal, total, status) VALUES (800, 'takeaway', 90, 90, 'completed') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO order_items (order_id, combo_id, quantity, unit_price, line_total) VALUES ($1, 5, 1, 90, 90)`,
      [order.rows[0].id]
    );

    const result = await importOrdersFromLegacy(legacyPool, neoDb);
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 }); // مفيش بنود قابلة للاستيراد
  });
});
