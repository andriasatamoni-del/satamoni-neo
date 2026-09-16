import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyPaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository";
import { KyselyPaymentRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyOrderRepository } from "../../../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";

describe("KyselyPaymentRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyPaymentRepository;
  let branchId: string;
  let orderId: string;
  let cashMethodId: string;
  let visaMethodId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    repo = new KyselyPaymentRepository(db);

    const branch = Branch.register({ name: "فرع دفعات-جست" });
    await new KyselyBranchRepository(db).save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف دفعات-جست" });
    const variant = item.addVariant({ label: "عادي", price: 60 });
    await menuItemRepo.save(item);

    const order = Order.register({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, variantId: variant.id, quantity: 1, unitPrice: 60 }] });
    await new KyselyOrderRepository(db).save(order);
    orderId = order.id;

    const methodRepo = new KyselyPaymentMethodRepository(db);
    const cash = PaymentMethod.register({ name: "كاش-دفعات-جست", kind: "cash" });
    const visa = PaymentMethod.register({ name: "فيزا-دفعات-جست", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    await methodRepo.save(cash);
    await methodRepo.save(visa);
    cashMethodId = cash.id;
    visaMethodId = visa.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM payments`.execute(db);
    await sql`DELETE FROM order_items WHERE order_id = ${orderId}`.execute(db);
    await sql`DELETE FROM orders WHERE id = ${orderId}`.execute(db);
    await sql`DELETE FROM payment_methods WHERE id IN (${sql.join([cashMethodId, visaMethodId])})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM payments`.execute(db);
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
