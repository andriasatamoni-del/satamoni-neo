import type { Database } from "../../../src/shared/database/database.token";
import { ReconciliationRecordRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/reconciliation-record.repository";
import { PaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-method.repository";
import { PaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment.repository";
import { BranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { OrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/order.repository";
import { MenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository";
import { ReconciliationRecord } from "../../../src/contexts/payment-control/domain/reconciliation-record.aggregate";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eq, like } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, paymentReconciliationRecords, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

describe("ReconciliationRecordRepository", () => {
  let db: Database;
  let repo: ReconciliationRecordRepository;
  let paymentId: string;
  let branchId: string;
  let orderId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new ReconciliationRecordRepository(db);

    const branch = Branch.register({ name: "فرع مطابقة-جست" });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف مطابقة-جست" });
    const variant = item.addVariant({ label: "عادي", price: 50 });
    await menuItemRepo.save(item);
    const order = Order.register({ branchId, orderType: "delivery", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 50 }] });
    await new OrderRepository(db).save(order);
    orderId = order.id;

    const instapayMethod = PaymentMethod.register({ name: "إنستاباي-مطابقة-جست", kind: "card_or_wallet", settlementChannel: "instapay" });
    await new PaymentMethodRepository(db).save(instapayMethod);

    const payment = Payment.lock({ orderId, branchId, paymentMethodId: instapayMethod.id, methodKind: "card_or_wallet", settlementChannel: "instapay", amount: 50 });
    await new PaymentRepository(db).save(payment);
    paymentId = payment.id;
  });

  afterAll(async () => {
    await db.delete(paymentReconciliationRecords);
    await db.delete(payments);
    await db.delete(printJobs).where(eq(printJobs.order_id, orderId));
    await db.delete(orderItems).where(eq(orderItems.order_id, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(paymentMethods).where(like(paymentMethods.name, "%مطابقة-جست%"));
    await db.delete(branches).where(eq(branches.id, branchId));
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(paymentReconciliationRecords);
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
