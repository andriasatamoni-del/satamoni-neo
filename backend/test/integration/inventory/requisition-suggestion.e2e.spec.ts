import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// REQ-1: اقتراح الطلبية - معاينة مبنية على استهلاك نفس يوم الأسبوع + خصم اللي مطلوب/في الطريق
describe("Inventory - اقتراح الطلبية (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let kitchenBranchId: string;
  let flourId: string;
  let sugarId: string;
  let untrackedId: string;
  const targetDate = "2030-01-10";

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

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
    await new KyselyUserRepository(db).save(
      User.register({
        name: "أدمن-اقتراح-طلبية-جست",
        email: "admin-requisition@jest.test",
        passwordHash: await new BcryptPasswordHasher().hash("12345678"),
        role: "admin",
      })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-requisition@jest.test", password: "12345678" })).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-اقتراح-طلبية-جست" });
    const kitchen = Branch.register({ name: "مطبخ-اقتراح-طلبية-جست" });
    await branchRepo.save(branch);
    await branchRepo.save(kitchen);
    branchId = branch.id;
    kitchenBranchId = kitchen.id;

    const itemRepo = new KyselyInventoryItemRepository(db);
    const flour = InventoryItem.register({ name: "أ-دقيق-اقتراح-جست", unit: "كيلو" });
    const sugar = InventoryItem.register({ name: "ب-سكر-اقتراح-جست", unit: "كيلو" });
    const untracked = InventoryItem.register({ name: "ج-ملح-من-غير-حدود-جست", unit: "كيلو" });
    for (const i of [flour, sugar, untracked]) await itemRepo.save(i);
    flourId = flour.id;
    sugarId = sugar.id;
    untrackedId = untracked.id;

    await request(server()).patch("/inventory/stock-thresholds").set(auth()).send({ branchId, inventoryItemId: flourId, minStock: 5, maxStock: 100 });
    await request(server()).patch("/inventory/stock-thresholds").set(auth()).send({ branchId, inventoryItemId: sugarId, reorderPoint: 2 });

    // رصيد حالي + تاريخ استهلاك مزروع مباشرة (نفس يوم الأسبوع بتاع targetDate، أسبوع وأسبوعين قبله)
    await sql`INSERT INTO branch_stock_balances (branch_id, inventory_item_id, quantity) VALUES
      (${branchId}, ${flourId}, 4), (${branchId}, ${sugarId}, 0)`.execute(db);
    const movements: [string, string, number, string][] = [
      [flourId, "CONSUMPTION", -30, "2030-01-03T10:00:00Z"],
      [flourId, "PRODUCTION_OUT", -10, "2030-01-03T11:00:00Z"],
      [flourId, "CONSUMPTION", -20, "2029-12-27T10:00:00Z"],
      [flourId, "RECEIPT", 500, "2029-12-27T09:00:00Z"],
      [flourId, "CONSUMPTION", -999, "2030-01-04T10:00:00Z"],
      [sugarId, "CONSUMPTION", -8, "2030-01-03T10:00:00Z"],
      [untrackedId, "CONSUMPTION", -50, "2030-01-03T10:00:00Z"],
    ];
    for (const [itemId, type, qty, at] of movements) {
      await sql`INSERT INTO stock_movements (inventory_item_id, branch_id, movement_type, quantity_delta, occurred_at)
        VALUES (${itemId}, ${branchId}, ${type}, ${qty}, ${at})`.execute(db);
    }

    // طلب تحويل لسه متقدّم (pending) للسكر، وطلب اتبعت (in transit) للدقيق
    const pending = await request(server())
      .post("/inventory/transfer-requests")
      .set(auth())
      .send({ fromBranchId: kitchenBranchId, toBranchId: branchId, lines: [{ inventoryItemId: sugarId, requestedQuantity: 3 }] });
    expect(pending.status).toBe(201);

    await request(server())
      .post("/inventory/movements")
      .set(auth())
      .send({ inventoryItemId: flourId, branchId: kitchenBranchId, movementType: "OPENING_BALANCE", quantityDelta: 100 });
    const inTransit = await request(server())
      .post("/inventory/transfer-requests")
      .set(auth())
      .send({ fromBranchId: kitchenBranchId, toBranchId: branchId, lines: [{ inventoryItemId: flourId, requestedQuantity: 6 }] });
    expect((await request(server()).post(`/inventory/transfer-requests/${inTransit.body.id}/approve`).set(auth()).send({})).status).toBe(201);
    expect((await request(server()).post(`/inventory/transfer-requests/${inTransit.body.id}/dispatch`).set(auth()).send({})).status).toBe(201);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM transfer_request_lines WHERE transfer_request_id IN (SELECT id FROM transfer_requests WHERE to_branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM transfer_requests WHERE to_branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id IN (${branchId}, ${kitchenBranchId})`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id IN (${branchId}, ${kitchenBranchId})`.execute(db);
    await sql`DELETE FROM branch_stock_thresholds WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${flourId}, ${sugarId}, ${untrackedId})`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id IN (${branchId}, ${kitchenBranchId})`.execute(db);
    await sql`DELETE FROM branches WHERE id IN (${branchId}, ${kitchenBranchId})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-requisition@jest.test'`.execute(db);
    await app.close();
  });

  test("بيقترح كميات مبنية على نفس يوم الأسبوع وبيخصم الرصيد واللي مطلوب واللي في الطريق", async () => {
    const res = await request(server())
      .get(`/inventory/requisition-suggestion?branchId=${branchId}&targetDate=${targetDate}&lookbackWeeks=2`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.coverageDays).toBe(1);
    // الصنف اللي من غير أي حدود مخزون مش بيظهر
    expect(res.body.lines.map((l: { inventoryItemId: string }) => l.inventoryItemId)).toEqual([flourId, sugarId]);

    const flour = res.body.lines[0];
    // (30 + 10) + 20 على أسبوعين = 30 متوسط. الاستلام والاستهلاك في يوم تاني متجاهلين
    expect(flour.avgWeekdayConsumption).toBe(30);
    expect(flour.target).toBe(35); // 30 + min 5
    expect(flour.currentStock).toBe(4);
    expect(flour.inTransitQuantity).toBe(6);
    expect(flour.pendingPipelineQuantity).toBe(0);
    expect(flour.suggestedQuantity).toBe(25); // 35 - (4 + 6)

    const sugar = res.body.lines[1];
    expect(sugar.avgWeekdayConsumption).toBe(4); // 8 / 2
    expect(sugar.pendingPipelineQuantity).toBe(3);
    expect(sugar.suggestedQuantity).toBe(1);
  });

  test("نافذة تغطية لحد تاريخ التزويد الجاي بتجمع استهلاك كل يوم بيوم أسبوعه", async () => {
    const res = await request(server())
      .get(`/inventory/requisition-suggestion?branchId=${branchId}&targetDate=${targetDate}&nextReplenishmentDate=2030-01-12&lookbackWeeks=2`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.coverageDays).toBe(2);
    const flour = res.body.lines[0];
    // يوم الهدف متوسطه 30، اليوم اللي بعده (2030-01-11) بيقارن بـ2030-01-04 (999) و2029-12-28 (0)
    expect(flour.expectedConsumption).toBe(30 + 999 / 2);
    expect(flour.target).toBe(100); // متسقّف بالحد الأقصى
  });

  test("بيرفض مدخلات ناقصة أو غلط", async () => {
    const missing = await request(server()).get(`/inventory/requisition-suggestion?branchId=${branchId}`).set(auth());
    expect(missing.status).toBe(400);
    const badDate = await request(server())
      .get(`/inventory/requisition-suggestion?branchId=${branchId}&targetDate=10-01-2030`)
      .set(auth());
    expect(badDate.status).toBe(400);
  });
});
