import { Kysely } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { PaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-method.repository";
import { PaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/payment.repository";
import { BranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { OrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/order.repository";
import { MenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { closeScriptDb, createScriptDb, kyselyOn } from "../../../src/shared/database/script-db";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

describe("PaymentRepository", () => {
  let database: ReturnType<typeof createScriptDb>;
  let db: Kysely<Database>;
  let repo: PaymentRepository;
  let branchId: string;
  let orderId: string;
  let cashMethodId: string;
  let visaMethodId: string;

  beforeAll(async () => {
    database = createScriptDb(process.env.DATABASE_URL as string);
    db = kyselyOn(database);
    repo = new PaymentRepository(database);

    const branch = Branch.register({ name: "فرع دفعات-جست" });
    await new BranchRepository(database).save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(database);
    const item = MenuItem.register({ name: "صنف دفعات-جست" });
    const variant = item.addVariant({ label: "عادي", price: 60 });
    await menuItemRepo.save(item);

    const order = Order.register({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 60 }] });
    await new OrderRepository(database).save(order);
    orderId = order.id;

    const methodRepo = new PaymentMethodRepository(database);
    const cash = PaymentMethod.register({ name: "كاش-دفعات-جست", kind: "cash" });
    const visa = PaymentMethod.register({ name: "فيزا-دفعات-جست", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    await methodRepo.save(cash);
    await methodRepo.save(visa);
    cashMethodId = cash.id;
    visaMethodId = visa.id;
  });

  afterAll(async () => {
    await database.delete(payments);
    await database.delete(printJobs).where(eq(printJobs.order_id, orderId));
    await database.delete(orderItems).where(eq(orderItems.order_id, orderId));
    await database.delete(orders).where(eq(orders.id, orderId));
    await database.delete(paymentMethods).where(inArray(paymentMethods.id, [cashMethodId, visaMethodId]));
    await database.delete(branches).where(eq(branches.id, branchId));
    await closeScriptDb(database);
  });

  afterEach(async () => {
    await database.delete(payments);
  });

  test("save بيقفل دفعة جديدة، وfindByOrderId بيرجّعها", async () => {
    const payment = Payment.lock({ orderId, branchId, paymentMethodId: cashMethodId, methodKind: "cash", settlementChannel: null, amount: 60 });
    await repo.save(payment);

    const found = await repo.findByOrderId(orderId);
    expect(found?.amount).toBe(60);
    expect(found?.methodKind).toBe("cash");
  });

  test("save تاني بعد applyAdjustment بيحدّث السنابشوت مش يكرر", async () => {
    const payment = Payment.lock({ orderId, branchId, paymentMethodId: cashMethodId, methodKind: "cash", settlementChannel: null, amount: 60 });
    await repo.save(payment);

    payment.applyAdjustment({ paymentMethodId: visaMethodId, methodKind: "card_or_wallet", settlementChannel: "visa_pos", amount: 75 });
    await repo.save(payment);

    const found = await repo.findById(payment.id);
    expect(found?.amount).toBe(75);
    expect(found?.settlementChannel).toBe("visa_pos");

    const all = await repo.list({ branchId });
    expect(all).toHaveLength(1); // تحديث مش تكرار
  });

  test("list بيفلتر بالـsettlementChannel صح", async () => {
    const payment = Payment.lock({ orderId, branchId, paymentMethodId: visaMethodId, methodKind: "card_or_wallet", settlementChannel: "visa_pos", amount: 60 });
    await repo.save(payment);

    expect(await repo.list({ settlementChannel: "visa_pos" })).toHaveLength(1);
    expect(await repo.list({ settlementChannel: "instapay" })).toHaveLength(0);
  });
});
