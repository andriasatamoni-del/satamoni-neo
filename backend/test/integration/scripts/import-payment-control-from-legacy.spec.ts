import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importPaymentControlFromLegacy } from "../../../scripts/import-payment-control-from-legacy";
import { KyselyPaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository";
import { KyselyPaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment.repository";
import { KyselyPaymentAdjustmentRequestRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-adjustment-request.repository";
import { KyselyReconciliationRecordRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-reconciliation-record.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyOrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importPaymentControlFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let methodRepo: KyselyPaymentMethodRepository;
  let paymentRepo: KyselyPaymentRepository;
  let adjustmentRepo: KyselyPaymentAdjustmentRequestRepository;
  let reconciliationRepo: KyselyReconciliationRecordRepository;
  let branchId: string;
  let orderId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS payment_reconciliation_records, payment_adjustment_requests, payments, payment_methods");
    await legacyPool.query(`
      CREATE TABLE payment_methods (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
        settlement_channel TEXT
      )
    `);
    await legacyPool.query(`
      CREATE TABLE payments (
        id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, payment_method_id INTEGER NOT NULL,
        method_kind TEXT NOT NULL, settlement_channel TEXT, amount NUMERIC NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT now(), locked_by INTEGER
      )
    `);
    await legacyPool.query(`
      CREATE TABLE payment_adjustment_requests (
        id SERIAL PRIMARY KEY, payment_id INTEGER NOT NULL, requested_by INTEGER, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        reason TEXT, proposed_payment_method_id INTEGER, proposed_amount NUMERIC, amount_delta NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING', decided_by INTEGER, decided_at TIMESTAMPTZ
      )
    `);
    await legacyPool.query(`
      CREATE TABLE payment_reconciliation_records (
        id SERIAL PRIMARY KEY, branch_id INTEGER, source TEXT NOT NULL, external_reference TEXT,
        external_amount NUMERIC NOT NULL, external_date DATE NOT NULL, matched_payment_id INTEGER,
        match_status TEXT NOT NULL DEFAULT 'UNMATCHED', notes TEXT, entered_by INTEGER, entered_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    methodRepo = new KyselyPaymentMethodRepository(neoDb);
    paymentRepo = new KyselyPaymentRepository(neoDb);
    adjustmentRepo = new KyselyPaymentAdjustmentRequestRepository(neoDb);
    reconciliationRepo = new KyselyReconciliationRecordRepository(neoDb);

    const branch = Branch.register({ name: "فرع استيراد-دفعات-جست", legacyBranchId: 501 });
    await new KyselyBranchRepository(neoDb).save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(neoDb);
    const item = MenuItem.register({ name: "صنف استيراد-دفعات-جست" });
    const variant = item.addVariant({ label: "عادي", price: 80 });
    await menuItemRepo.save(item);
    const order = Order.register({
      branchId, orderType: "takeaway", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 80 }], legacyOrderId: 901,
    });
    await new KyselyOrderRepository(neoDb).save(order);
    orderId = order.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM payment_reconciliation_records`.execute(neoDb);
    await sql`DELETE FROM payment_adjustment_requests`.execute(neoDb);
    await sql`DELETE FROM payments`.execute(neoDb);
    await sql`DELETE FROM print_jobs WHERE order_id = ${orderId}`.execute(neoDb);
    await sql`DELETE FROM order_items WHERE order_id = ${orderId}`.execute(neoDb);
    await sql`DELETE FROM orders WHERE id = ${orderId}`.execute(neoDb);
    await sql`DELETE FROM payment_methods WHERE name LIKE '%استيراد-دفعات-جست%'`.execute(neoDb);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM payment_reconciliation_records");
    await legacyPool.query("DELETE FROM payment_adjustment_requests");
    await legacyPool.query("DELETE FROM payments");
    await legacyPool.query("DELETE FROM payment_methods");
    await sql`DELETE FROM payment_reconciliation_records`.execute(neoDb);
    await sql`DELETE FROM payment_adjustment_requests`.execute(neoDb);
    await sql`DELETE FROM payments`.execute(neoDb);
    await sql`DELETE FROM payment_methods WHERE name LIKE '%استيراد-دفعات-جست%'`.execute(neoDb);
  });

  test("بيستورد طريقة دفع + دفعة مقفولة (بحالتها النهائية) + طلب تعديل + سطر مطابقة", async () => {
    await legacyPool.query(
      `INSERT INTO payment_methods (name, kind, settlement_channel) VALUES ('كاش-استيراد-دفعات-جست', 'cash', NULL)`
    );
    await legacyPool.query(
      `INSERT INTO payments (order_id, branch_id, payment_method_id, method_kind, amount, locked_by)
       VALUES (901, 501, 1, 'cash', 80, NULL)`
    );
    await legacyPool.query(
      `INSERT INTO payment_adjustment_requests (payment_id, reason, proposed_amount, amount_delta, status)
       VALUES (1, 'تصحيح مبلغ بسيط', 90, 10, 'APPROVED')`
    );
    await legacyPool.query(
      `INSERT INTO payment_reconciliation_records (branch_id, source, external_amount, external_date, matched_payment_id, match_status)
       VALUES (501, 'talabat_statement', 90, '2026-01-01', 1, 'MATCHED')`
    );

    const result = await importPaymentControlFromLegacy(legacyPool, neoDb);
    expect(result.paymentMethods).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.payments).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.adjustmentRequests).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.reconciliationRecords).toEqual({ created: 1, updated: 0, skipped: 0 });

    const method = await methodRepo.findByLegacyPaymentMethodId(1);
    expect(method?.name).toBe("كاش-استيراد-دفعات-جست");

    const payment = await paymentRepo.findByLegacyPaymentId(1);
    expect(payment?.amount).toBe(80);
    expect(payment?.branchId).toBe(branchId);
    expect(payment?.orderId).toBe(orderId);

    const adjustments = await adjustmentRepo.list({ paymentId: payment!.id });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].status).toBe("APPROVED");
    expect(adjustments[0].proposedPaymentMethodId).toBeNull(); // نفس طريقة الدفع، تصحيح مبلغ بس

    const records = await reconciliationRepo.list({ branchId });
    expect(records).toHaveLength(1);
    expect(records[0].matchStatus).toBe("MATCHED");
    expect(records[0].matchedPaymentId).toBe(payment!.id);
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    const { rows: [{ id: legacyId }] } = await legacyPool.query<{ id: number }>(
      `INSERT INTO payment_methods (name, kind) VALUES ('فيزا-استيراد-دفعات-جست', 'card_or_wallet') RETURNING id`
    );
    const first = await importPaymentControlFromLegacy(legacyPool, neoDb);
    expect(first.paymentMethods).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query("UPDATE payment_methods SET name = 'فيزا-استيراد-دفعات-جست معدّل'");
    const second = await importPaymentControlFromLegacy(legacyPool, neoDb);
    expect(second.paymentMethods).toEqual({ created: 0, updated: 1, skipped: 0 });

    const method = await methodRepo.findByLegacyPaymentMethodId(legacyId);
    expect(method?.name).toBe("فيزا-استيراد-دفعات-جست معدّل");
  });

  test("بيتخطّى دفعة لطلب مش مستورد لسه، من غير ما يوقف باقي الاستيراد", async () => {
    await legacyPool.query(`INSERT INTO payment_methods (name, kind) VALUES ('كاش-استيراد-دفعات-جست', 'cash')`);
    await legacyPool.query(
      `INSERT INTO payments (order_id, branch_id, payment_method_id, method_kind, amount) VALUES (999999, 501, 1, 'cash', 50)`
    );

    const result = await importPaymentControlFromLegacy(legacyPool, neoDb);
    expect(result.payments).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});
