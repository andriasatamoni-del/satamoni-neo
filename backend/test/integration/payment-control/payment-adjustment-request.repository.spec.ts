import type { Database } from "../../../src/shared/database/database.token";
import { PaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-method.repository";
import { PaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment.repository";
import { PaymentAdjustmentRequestRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-adjustment-request.repository";
import { BranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { OrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/order.repository";
import { MenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";
import { PaymentAdjustmentRequest } from "../../../src/contexts/payment-control/domain/payment-adjustment-request.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eq, like } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentAdjustmentRequests, paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

describe("PaymentAdjustmentRequestRepository", () => {
  let db: Database;
  let repo: PaymentAdjustmentRequestRepository;
  let paymentId: string;
  let visaMethodId: string;
  let branchId: string;
  let orderId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new PaymentAdjustmentRequestRepository(db);

    const branch = Branch.register({ name: "فرع تعديل-جست" });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف تعديل-جست" });
    const variant = item.addVariant({ label: "عادي", price: 60 });
    await menuItemRepo.save(item);
    const order = Order.register({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 60 }] });
    await new OrderRepository(db).save(order);
    orderId = order.id;

    const methodRepo = new PaymentMethodRepository(db);
    const cash = PaymentMethod.register({ name: "كاش-تعديل-جست", kind: "cash" });
    const visa = PaymentMethod.register({ name: "فيزا-تعديل-جست", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    await methodRepo.save(cash);
    await methodRepo.save(visa);
    visaMethodId = visa.id;

    const payment = Payment.lock({ orderId, branchId, paymentMethodId: cash.id, methodKind: "cash", settlementChannel: null, amount: 60 });
    await new PaymentRepository(db).save(payment);
    paymentId = payment.id;
  });

  afterAll(async () => {
    await db.delete(paymentAdjustmentRequests);
    await db.delete(payments);
    await db.delete(printJobs).where(eq(printJobs.order_id, orderId));
    await db.delete(orderItems).where(eq(orderItems.order_id, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(paymentMethods).where(like(paymentMethods.name, "%تعديل-جست%"));
    await db.delete(branches).where(eq(branches.id, branchId));
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(paymentAdjustmentRequests);
  });

  test("save بيسجّل طلب PENDING، وfindById بيرجّعه", async () => {
    const request = PaymentAdjustmentRequest.register({ paymentId, proposedPaymentMethodId: visaMethodId, proposedAmount: 60, amountDelta: 60 });
    await repo.save(request);
    const found = await repo.findById(request.id);
    expect(found?.status).toBe("PENDING");
  });

  test("save تاني بعد approve بيحدّث الحالة مش يكرر", async () => {
    const request = PaymentAdjustmentRequest.register({ paymentId, proposedPaymentMethodId: visaMethodId, proposedAmount: 60, amountDelta: 60 });
    await repo.save(request);
    request.approve(null);
    await repo.save(request);

    const found = await repo.findById(request.id);
    expect(found?.status).toBe("APPROVED");
    expect(await repo.list({ paymentId })).toHaveLength(1);
  });

  test("list بيفلتر بالـstatus صح", async () => {
    const request = PaymentAdjustmentRequest.register({ paymentId, proposedPaymentMethodId: visaMethodId, proposedAmount: 60, amountDelta: 60 });
    await repo.save(request);
    expect(await repo.list({ status: "PENDING" })).toHaveLength(1);
    expect(await repo.list({ status: "APPROVED" })).toHaveLength(0);
  });
});
