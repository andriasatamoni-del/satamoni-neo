import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importProcurementFromLegacy } from "../../../scripts/import-procurement-from-legacy";
import { KyselySupplierRepository } from "../../../src/contexts/procurement/infrastructure/persistence/kysely-supplier.repository";
import { KyselyPurchaseOrderRepository } from "../../../src/contexts/procurement/infrastructure/persistence/kysely-purchase-order.repository";
import { KyselyGoodsReceiptRepository } from "../../../src/contexts/procurement/infrastructure/persistence/kysely-goods-receipt.repository";
import { KyselyStockMovementRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importProcurementFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let supplierRepo: KyselySupplierRepository;
  let purchaseOrderRepo: KyselyPurchaseOrderRepository;
  let goodsReceiptRepo: KyselyGoodsReceiptRepository;
  let movementRepo: KyselyStockMovementRepository;
  let branchId: string;
  let inventoryItemId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS goods_receipt_items, goods_receipts, purchase_order_items, purchase_orders, suppliers");
    await legacyPool.query(`CREATE TABLE suppliers (id SERIAL PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT, phone TEXT, email TEXT, address TEXT, payment_terms TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE')`);
    await legacyPool.query(`CREATE TABLE purchase_orders (id SERIAL PRIMARY KEY, supplier_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await legacyPool.query(`CREATE TABLE purchase_order_items (id SERIAL PRIMARY KEY, purchase_order_id INTEGER NOT NULL, inventory_item_id INTEGER NOT NULL, ordered_quantity NUMERIC NOT NULL, unit_price NUMERIC NOT NULL)`);
    await legacyPool.query(`CREATE TABLE goods_receipts (id SERIAL PRIMARY KEY, purchase_order_id INTEGER, supplier_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', received_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), posted_at TIMESTAMPTZ)`);
    await legacyPool.query(`CREATE TABLE goods_receipt_items (id SERIAL PRIMARY KEY, goods_receipt_id INTEGER NOT NULL, inventory_item_id INTEGER NOT NULL, accepted_quantity NUMERIC NOT NULL, unit_price NUMERIC NOT NULL)`);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    supplierRepo = new KyselySupplierRepository(neoDb);
    purchaseOrderRepo = new KyselyPurchaseOrderRepository(neoDb);
    goodsReceiptRepo = new KyselyGoodsReceiptRepository(neoDb);
    movementRepo = new KyselyStockMovementRepository(neoDb);

    const branchRepo = new KyselyBranchRepository(neoDb);
    const branch = Branch.register({ name: "فرع مشتريات-fixture", legacyBranchId: 900 });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(neoDb);
    const item = InventoryItem.register({ name: "زيت-مشتريات-fixture", unit: "لتر", legacyInventoryItemId: 950 });
    await inventoryRepo.save(item);
    inventoryItemId = item.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM inventory_items WHERE id = ${inventoryItemId}`.execute(neoDb);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM goods_receipt_items; DELETE FROM goods_receipts; DELETE FROM purchase_order_items; DELETE FROM purchase_orders; DELETE FROM suppliers");
    await sql`DELETE FROM goods_receipt_items`.execute(neoDb);
    await sql`DELETE FROM goods_receipts`.execute(neoDb);
    await sql`DELETE FROM purchase_order_items`.execute(neoDb);
    await sql`DELETE FROM purchase_orders`.execute(neoDb);
    await sql`DELETE FROM suppliers`.execute(neoDb);
  });

  test("بيستورد مورد وأمر شراء وإذن استلام POSTED مرتبط ببعض", async () => {
    const supplier = await legacyPool.query(`INSERT INTO suppliers (name, status) VALUES ('مورد-fixture', 'ACTIVE') RETURNING id`);
    const po = await legacyPool.query(
      `INSERT INTO purchase_orders (supplier_id, branch_id, status) VALUES ($1, 900, 'FULLY_RECEIVED') RETURNING id`,
      [supplier.rows[0].id]
    );
    await legacyPool.query(
      `INSERT INTO purchase_order_items (purchase_order_id, inventory_item_id, ordered_quantity, unit_price) VALUES ($1, 950, 50, 8)`,
      [po.rows[0].id]
    );
    const gr = await legacyPool.query(
      `INSERT INTO goods_receipts (purchase_order_id, supplier_id, branch_id, status, posted_at) VALUES ($1, $2, 900, 'POSTED', now()) RETURNING id`,
      [po.rows[0].id, supplier.rows[0].id]
    );
    await legacyPool.query(
      `INSERT INTO goods_receipt_items (goods_receipt_id, inventory_item_id, accepted_quantity, unit_price) VALUES ($1, 950, 48, 8)`,
      [gr.rows[0].id]
    );

    const result = await importProcurementFromLegacy(legacyPool, neoDb);
    expect(result.suppliers).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.purchaseOrders).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.goodsReceipts).toEqual({ created: 1, updated: 0, skipped: 0 });

    const importedSupplier = await supplierRepo.findByLegacySupplierId(supplier.rows[0].id);
    const importedPo = await purchaseOrderRepo.findByLegacyPurchaseOrderId(po.rows[0].id);
    expect(importedPo?.status).toBe("RECEIVED");
    expect(importedPo?.branchId).toBe(branchId);

    const importedGr = await goodsReceiptRepo.findByLegacyGoodsReceiptId(gr.rows[0].id);
    expect(importedGr?.status).toBe("CONFIRMED");
    expect(importedGr?.purchaseOrderId).toBe(importedPo?.id);
    expect(importedGr?.supplierId).toBe(importedSupplier?.id);

    // أهم جزء: الرصيد مبيتحركش من الاستيراد ده - already covered by opening balance
    expect(await movementRepo.getBalance(branchId, inventoryItemId)).toBe(0);
  });

  test("إذن استلام CANCELLED بيتخطّى تمامًا", async () => {
    const supplier = await legacyPool.query(`INSERT INTO suppliers (name) VALUES ('مورد-تاني-fixture') RETURNING id`);
    await legacyPool.query(
      `INSERT INTO goods_receipts (supplier_id, branch_id, status) VALUES ($1, 900, 'CANCELLED')`,
      [supplier.rows[0].id]
    );

    const result = await importProcurementFromLegacy(legacyPool, neoDb);
    expect(result.goodsReceipts.skipped).toBeGreaterThanOrEqual(1);
  });

  test("تشغيلة تانية - المورد بيتحدّث، وإذن الاستلام مايتكررش (idempotent)", async () => {
    const supplier = await legacyPool.query(`INSERT INTO suppliers (name, phone) VALUES ('مورد-تالت-fixture', '111') RETURNING id`);
    const first = await importProcurementFromLegacy(legacyPool, neoDb);
    expect(first.suppliers.created).toBe(1);

    await legacyPool.query(`UPDATE suppliers SET phone = '222' WHERE id = $1`, [supplier.rows[0].id]);
    const second = await importProcurementFromLegacy(legacyPool, neoDb);
    expect(second.suppliers).toEqual({ created: 0, updated: 1, skipped: 0 });

    const imported = await supplierRepo.findByLegacySupplierId(supplier.rows[0].id);
    expect(imported?.phone).toBe("222");
  });
});
