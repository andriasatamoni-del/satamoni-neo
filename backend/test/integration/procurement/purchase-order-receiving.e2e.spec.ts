import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// PROC-BUG-1: حالة أمر الشراء لازم تتحدّث تلقائيًا مع تأكيد أذون الاستلام المربوطة بيه
describe("Procurement - استلام أوامر الشراء وتحديث حالتها (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let flourId: string;
  let sugarId: string;
  let supplierId: string;
  const orderIds: string[] = [];

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function createSentOrder(): Promise<string> {
    const po = await request(server())
      .post("/procurement/purchase-orders")
      .set(auth())
      .send({
        supplierId,
        branchId,
        lines: [
          { inventoryItemId: flourId, quantity: 10, unitPrice: 20 },
          { inventoryItemId: sugarId, quantity: 4, unitPrice: 30 },
        ],
      });
    expect(po.status).toBe(201);
    orderIds.push(po.body.id);
    await request(server()).post(`/procurement/purchase-orders/${po.body.id}/send`).set(auth()).send({});
    return po.body.id;
  }

  async function receiveAndConfirm(purchaseOrderId: string, lines: { inventoryItemId: string; quantity: number; unitCost: number }[]) {
    const receipt = await request(server())
      .post("/procurement/goods-receipts")
      .set(auth())
      .send({ purchaseOrderId, supplierId, branchId, lines });
    expect(receipt.status).toBe(201);
    const confirmed = await request(server()).post(`/procurement/goods-receipts/${receipt.body.id}/confirm`).set(auth()).send({});
    expect(confirmed.status).toBe(201);
  }

  async function orderStatus(id: string): Promise<string> {
    const res = await request(server()).get("/procurement/purchase-orders").set(auth());
    return res.body.find((o: { id: string }) => o.id === id).status;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { KyselyBranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const db = app.get(KYSELY);
    const admin = User.register({
      name: "أدمن-استلام-أوامر-جست",
      email: "admin-poreceiving@jest.test",
      passwordHash: await new BcryptPasswordHasher().hash("12345678"),
      role: "admin",
    });
    await new KyselyUserRepository(db).save(admin);
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-poreceiving@jest.test", password: "12345678" })).body.token;

    const branch = Branch.register({ name: "فرع-استلام-أوامر-جست" });
    await new KyselyBranchRepository(db).save(branch);
    branchId = branch.id;

    const itemRepo = new KyselyInventoryItemRepository(db);
    const flour = InventoryItem.register({ name: "دقيق-استلام-أوامر-جست", unit: "كيلو" });
    const sugar = InventoryItem.register({ name: "سكر-استلام-أوامر-جست", unit: "كيلو" });
    await itemRepo.save(flour);
    await itemRepo.save(sugar);
    flourId = flour.id;
    sugarId = sugar.id;

    const supplier = await request(server()).post("/procurement/suppliers").set(auth()).send({ name: "مورد-استلام-أوامر-جست" });
    supplierId = supplier.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT id FROM goods_receipts WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM goods_receipts WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM purchase_orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM suppliers WHERE id = ${supplierId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${flourId}, ${sugarId})`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-poreceiving@jest.test'`.execute(db);
    await app.close();
  });

  test("استلام جزئي ثم استلام الباقي: SENT -> PARTIALLY_RECEIVED -> RECEIVED", async () => {
    const orderId = await createSentOrder();
    expect(await orderStatus(orderId)).toBe("SENT");

    await receiveAndConfirm(orderId, [{ inventoryItemId: flourId, quantity: 6, unitCost: 20 }]);
    expect(await orderStatus(orderId)).toBe("PARTIALLY_RECEIVED");

    const progress = await request(server()).get(`/procurement/purchase-orders/${orderId}/receipt-progress`).set(auth());
    expect(progress.status).toBe(200);
    const flourProgress = progress.body.find((p: { inventoryItemId: string }) => p.inventoryItemId === flourId);
    expect(flourProgress).toMatchObject({ orderedQuantity: 10, receivedQuantity: 6, remainingQuantity: 4 });
    const sugarProgress = progress.body.find((p: { inventoryItemId: string }) => p.inventoryItemId === sugarId);
    expect(sugarProgress).toMatchObject({ orderedQuantity: 4, receivedQuantity: 0, remainingQuantity: 4 });

    await receiveAndConfirm(orderId, [
      { inventoryItemId: flourId, quantity: 4, unitCost: 20 },
      { inventoryItemId: sugarId, quantity: 4, unitCost: 30 },
    ]);
    expect(await orderStatus(orderId)).toBe("RECEIVED");
  });

  test("استلام كامل مرة واحدة: SENT -> RECEIVED، وإذن DRAFT لسه ما أكّدش مايغيّرش الحالة", async () => {
    const orderId = await createSentOrder();
    const draft = await request(server())
      .post("/procurement/goods-receipts")
      .set(auth())
      .send({ purchaseOrderId: orderId, supplierId, branchId, lines: [{ inventoryItemId: flourId, quantity: 10, unitCost: 20 }] });
    expect(draft.status).toBe(201);
    expect(await orderStatus(orderId)).toBe("SENT");

    await receiveAndConfirm(orderId, [
      { inventoryItemId: flourId, quantity: 10, unitCost: 20 },
      { inventoryItemId: sugarId, quantity: 4, unitCost: 30 },
    ]);
    expect(await orderStatus(orderId)).toBe("RECEIVED");
  });

  test("مينفعش تسجّل استلام على أمر DRAFT أو مستلم بالكامل أو ملغي", async () => {
    const draftOrder = await request(server())
      .post("/procurement/purchase-orders")
      .set(auth())
      .send({ supplierId, branchId, lines: [{ inventoryItemId: flourId, quantity: 1, unitPrice: 1 }] });
    orderIds.push(draftOrder.body.id);
    const onDraft = await request(server())
      .post("/procurement/goods-receipts")
      .set(auth())
      .send({ purchaseOrderId: draftOrder.body.id, supplierId, branchId, lines: [{ inventoryItemId: flourId, quantity: 1, unitCost: 1 }] });
    expect(onDraft.status).toBe(400);

    const fullOrder = await createSentOrder();
    await receiveAndConfirm(fullOrder, [
      { inventoryItemId: flourId, quantity: 10, unitCost: 20 },
      { inventoryItemId: sugarId, quantity: 4, unitCost: 30 },
    ]);
    const onReceived = await request(server())
      .post("/procurement/goods-receipts")
      .set(auth())
      .send({ purchaseOrderId: fullOrder, supplierId, branchId, lines: [{ inventoryItemId: flourId, quantity: 1, unitCost: 20 }] });
    expect(onReceived.status).toBe(400);

    const cancelledOrder = await createSentOrder();
    await request(server()).post(`/procurement/purchase-orders/${cancelledOrder}/cancel`).set(auth()).send({});
    const onCancelled = await request(server())
      .post("/procurement/goods-receipts")
      .set(auth())
      .send({ purchaseOrderId: cancelledOrder, supplierId, branchId, lines: [{ inventoryItemId: flourId, quantity: 1, unitCost: 20 }] });
    expect(onCancelled.status).toBe(400);
  });

  test("أمر مستلم جزئيًا مينفعش يتلغي، وبيظهر في تقرير أوامر الشراء المعلّقة", async () => {
    const orderId = await createSentOrder();
    await receiveAndConfirm(orderId, [{ inventoryItemId: sugarId, quantity: 1, unitCost: 30 }]);

    const cancel = await request(server()).post(`/procurement/purchase-orders/${orderId}/cancel`).set(auth()).send({});
    expect(cancel.status).toBe(400);

    const outstanding = await request(server()).get(`/reports/outstanding-purchase-orders?branchId=${branchId}`).set(auth());
    expect(outstanding.status).toBe(200);
    expect(outstanding.body.map((o: { id: string }) => o.id)).toContain(orderId);
  });

  test("receipt-progress لأمر مش موجود بيرجّع 404", async () => {
    const res = await request(server())
      .get("/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/receipt-progress")
      .set(auth());
    expect(res.status).toBe(404);
  });
});
