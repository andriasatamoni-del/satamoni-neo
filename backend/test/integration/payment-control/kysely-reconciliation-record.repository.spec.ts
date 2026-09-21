import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyReconciliationRecordRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-reconciliation-record.repository";
import { KyselyPaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository";
import { KyselyPaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyOrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { ReconciliationRecord } from "../../../src/contexts/payment-control/domain/reconciliation-record.aggregate";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";

describe("KyselyReconciliationRecordRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyReconciliationRecordRepository;
  let paymentId: string;
  let branchId: string;
  let orderId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    repo = new KyselyReconciliationRecordRepository(db);

    const branch = Branch.register({ name: "فرع مطابقة-جست" });
    await new KyselyBranchRepository(db).save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف مطابقة-جست" });
    const variant = item.addVariant({ label: "عادي", price: 50 });
    await menuItemRepo.save(item);
    const order = Order.register({ branchId, orderType: "delivery", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 50 }] });
    await new KyselyOrderRepository(db).save(order);
    orderId = order.id;

    const instapayMethod = PaymentMethod.register({ name: "إنستاباي-مطابقة-جست", kind: "card_or_wallet", settlementChannel: "instapay" });
    await new KyselyPaymentMethodRepository(db).save(instapayMethod);

    const payment = Payment.lock({ orderId, branchId, paymentMethodId: instapayMethod.id, methodKind: "card_or_wallet", settlementChannel: "instapay", amount: 50 });
    await new KyselyPaymentRepository(db).save(payment);
    paymentId = payment.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM payment_reconciliation_records`.execute(db);
    await sql`DELETE FROM payments`.execute(db);
    await sql`DELETE FROM print_jobs WHERE order_id = ${orderId}`.execute(db);
    await sql`DELETE FROM order_items WHERE order_id = ${orderId}`.execute(db);
    await sql`DELETE FROM orders WHERE id = ${orderId}`.execute(db);
    await sql`DELETE FROM payment_methods WHERE name LIKE '%مطابقة-جست%'`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM payment_reconciliation_records`.execute(db);
  });

  test("save بيسجّل سطر UNMATCHED، وfindById بيرجّعه", async () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date("2026-01-01") });
    await repo.save(record);
    const found = await repo.findById(record.id);
    expect(found?.matchStatus).toBe("UNMATCHED");
  });

  test("save تاني بعد match بيحدّث الحالة والدفعة المرتبطة", async () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 50, externalDate: new Date("2026-01-01") });
    await repo.save(record);
    record.match(paymentId);
    await repo.save(record);

    const found = await repo.findById(record.id);
    expect(found?.matchStatus).toBe("MATCHED");
    expect(found?.matchedPaymentId).toBe(paymentId);
  });

  test("listUnmatchedBySource بيرجّع الغير متطابق بس لنفس المصدر", async () => {
    const instapayUnmatched = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date("2026-01-01") });
    const instapayMatched = ReconciliationRecord.register({ source: "instapay", externalAmount: 50, externalDate: new Date("2026-01-01") });
    instapayMatched.match(paymentId);
    const orangeCash = ReconciliationRecord.register({ source: "orange_cash", externalAmount: 100, externalDate: new Date("2026-01-01") });
    await repo.save(instapayUnmatched);
    await repo.save(instapayMatched);
    await repo.save(orangeCash);

    const result = await repo.listUnmatchedBySource("instapay");
    expect(result.map((r) => r.id)).toEqual([instapayUnmatched.id]);
  });
});
