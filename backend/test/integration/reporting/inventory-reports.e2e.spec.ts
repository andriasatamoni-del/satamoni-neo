import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Reporting - تقارير المخزون (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchManagerToken: string;
  let ckBranchId: string;
  let branchAId: string;
  let branchBId: string;
  let costedItemId: string;
  let uncostedItemId: string;
  let negItemId: string;
  let transferItemId: string;
  let transferRequestId: string;
  let transferLineId: string;
  const today = new Date().toISOString().slice(0, 10);

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
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تقارير-مخزون-جست", email: "admin-invreports@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-invreports@jest.test", password: "12345678" })).body.token;

    const branchARes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع-أ-تقارير-مخزون-جست" });
    branchAId = branchARes.body.id;

    const branchBRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع-ب-تقارير-مخزون-جست" });
    branchBId = branchBRes.body.id;

    const ckRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سنتر كيتشن-تقارير-مخزون-جست", isCentralKitchen: true });
    ckBranchId = ckRes.body.id;

    const branchManager = User.register({
      name: "مدير فرع-تقارير-مخزون-جست", email: "manager-invreports@jest.test", passwordHash: await hasher.hash("12345678"),
      role: "branch_manager", branchId: branchAId,
    });
    await userRepo.save(branchManager);
    branchManagerToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "manager-invreports@jest.test", password: "12345678" })).body.token;

    const itemRepo = new KyselyInventoryItemRepository(db);

    // صنف بتكلفة وحدة معروفة - 5 كيلو في فرع أ و8 كيلو في فرع ب (لتقييم المخزون + كارت الصنف + المقارنة)
    const costedItem = InventoryItem.register({ name: "صنف-متكلّف-تقارير-مخزون-جست", unit: "كيلو", unitCost: 10 });
    await itemRepo.save(costedItem);
    costedItemId = costedItem.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: costedItemId, branchId: branchAId, movementType: "RECEIPT", quantityDelta: 5 });
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: costedItemId, branchId: branchAId, movementType: "CONSUMPTION", quantityDelta: -1 });
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: costedItemId, branchId: branchBId, movementType: "RECEIPT", quantityDelta: 8 });

    // صنف من غير تكلفة وحدة - عشان costIncomplete
    const uncostedItem = InventoryItem.register({ name: "صنف-من-غير-تكلفة-تقارير-مخزون-جست", unit: "قطعة" });
    await itemRepo.save(uncostedItem);
    uncostedItemId = uncostedItem.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: uncostedItemId, branchId: branchAId, movementType: "RECEIPT", quantityDelta: 3 });

    // صنف برصيد سالب مسموح بموافقة
    const negItem = InventoryItem.register({
      name: "صنف-سالب-تقارير-مخزون-جست", unit: "قطعة", negativeStockPolicy: "ALLOW_WITH_APPROVAL",
    });
    await itemRepo.save(negItem);
    negItemId = negItem.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: negItemId, branchId: branchAId, movementType: "CONSUMPTION", quantityDelta: -2, approved: true });

    // صنف تحويل - رصيد ابتدائي 30 في السنتر كيتشن
    const transferItem = InventoryItem.register({ name: "صنف-تحويل-تقارير-مخزون-جست", unit: "كيلو", unitCost: 4 });
    await itemRepo.save(transferItem);
    transferItemId = transferItem.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: transferItemId, branchId: ckBranchId, movementType: "RECEIPT", quantityDelta: 30 });

    const createRes = await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: branchAId, lines: [{ inventoryItemId: transferItemId, requestedQuantity: 20 }] });
    transferRequestId = createRes.body.id;
    transferLineId = createRes.body.lines[0].id;

    await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${transferRequestId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${transferRequestId}/dispatch`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    // استلام جزئي - كيلوين فقد أثناء النقل عشان اختبار الـvariance
    await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${transferRequestId}/receive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantities: { [transferLineId]: 18 } });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM transfer_request_lines WHERE transfer_request_id = ${transferRequestId}`.execute(db);
    await sql`DELETE FROM transfer_requests WHERE id = ${transferRequestId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id IN (${ckBranchId}, ${branchAId}, ${branchBId})`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id IN (${ckBranchId}, ${branchAId}, ${branchBId})`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${costedItemId}, ${uncostedItemId}, ${negItemId}, ${transferItemId})`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id IN (${ckBranchId}, ${branchAId}, ${branchBId})`.execute(db);
    await sql`DELETE FROM branches WHERE id IN (${ckBranchId}, ${branchAId}, ${branchBId})`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-invreports@jest.test', 'manager-invreports@jest.test')`.execute(db);
    await app.close();
  });

  test("GET /reports/inventory-valuation - قيمة كل صنف (كمية × تكلفة) + costIncomplete للأصناف من غير تكلفة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory-valuation?branchId=${branchAId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const costedRow = res.body.items.find((i: { inventoryItemId: string }) => i.inventoryItemId === costedItemId);
    expect(costedRow.quantity).toBe(4); // 5 - 1
    expect(costedRow.unitCost).toBe(10);
    expect(costedRow.value).toBe(40);
    expect(costedRow.costIncomplete).toBe(false);

    const uncostedRow = res.body.items.find((i: { inventoryItemId: string }) => i.inventoryItemId === uncostedItemId);
    expect(uncostedRow.quantity).toBe(3);
    expect(uncostedRow.unitCost).toBeNull();
    expect(uncostedRow.value).toBe(0);
    expect(uncostedRow.costIncomplete).toBe(true);

    const branchRow = res.body.byBranch.find((b: { branchId: string }) => b.branchId === branchAId);
    expect(branchRow.totalValue).toBeGreaterThanOrEqual(40);
  });

  test("GET /reports/stock-card - الحركات بالترتيب الزمني مع الرصيد بعد كل حركة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/stock-card?branchId=${branchAId}&inventoryItemId=${costedItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].movementType).toBe("RECEIPT");
    expect(res.body[0].quantityDelta).toBe(5);
    expect(res.body[0].balanceAfter).toBe(5);
    expect(res.body[0].unitCost).toBe(10);
    expect(res.body[1].movementType).toBe("CONSUMPTION");
    expect(res.body[1].quantityDelta).toBe(-1);
    expect(res.body[1].balanceAfter).toBe(4);
  });

  test("GET /reports/stock-card من غير branchId (أدمن من غير فلتر) -> 400", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/stock-card?inventoryItemId=${costedItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test("GET /reports/transfers - التحويل المستلم جزئيًا بيظهر بفرق (variance) صحيح", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/transfers?branchId=${branchAId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const row = res.body.find((t: { id: string }) => t.id === transferRequestId);
    expect(row).toBeDefined();
    expect(row.fromBranchId).toBe(ckBranchId);
    expect(row.toBranchId).toBe(branchAId);
    expect(row.status).toBe("RECEIVED");
    const line = row.lines.find((l: { inventoryItemId: string }) => l.inventoryItemId === transferItemId);
    expect(line.dispatchedQuantity).toBe(20);
    expect(line.receivedQuantity).toBe(18);
    expect(line.variance).toBe(2);
  });

  test("GET /reports/negative-stock - القائمة التفصيلية للأصناف برصيد سالب", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/negative-stock?branchId=${branchAId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const row = res.body.find((r: { inventoryItemId: string }) => r.inventoryItemId === negItemId);
    expect(row).toBeDefined();
    expect(row.quantity).toBe(-2);
    expect(row.negativeStockPolicy).toBe("ALLOW_WITH_APPROVAL");
  });

  test("GET /reports/inventory-comparison - رصيد نفس الصنف جنب بعض في كل الفروع", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory-comparison?inventoryItemId=${costedItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const rowA = res.body.find((r: { branchId: string }) => r.branchId === branchAId);
    const rowB = res.body.find((r: { branchId: string }) => r.branchId === branchBId);
    expect(rowA.quantity).toBe(4);
    expect(rowB.quantity).toBe(8);
    expect(res.body.some((r: { branchId: string }) => r.branchId === ckBranchId)).toBe(false); // سنتر الكيتشن مستبعد
  });

  test("مدير فرع (معندوش reports.branch_health) -> inventory-comparison بيرجّع 403", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory-comparison?inventoryItemId=${costedItemId}`)
      .set("Authorization", `Bearer ${branchManagerToken}`);
    expect(res.status).toBe(403);
  });

  test("مدير فرع (عنده reports.view) -> inventory-valuation بيتقفل على فرعه تلقائيًا", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory-valuation?branchId=${branchBId}`) // بيحاول يشوف فرع تاني
      .set("Authorization", `Bearer ${branchManagerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { branchId: string }) => i.branchId === branchAId)).toBe(true);
  });
});
