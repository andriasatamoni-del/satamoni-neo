import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لطلبات التحويل بين الفروع (transfer_requests) - نفس مفهوم kitchen_orders بالريبو القديم بس معمّم.
// راجع تعليق transfer-request.aggregate.ts للتفاصيل الكاملة
describe("Inventory - طلبات التحويل بين الفروع (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let ckBranchId: string;
  let branchId: string;
  let flourItemId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تحويل-جست", email: "admin-transfer@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-transfer@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const ck = Branch.register({ name: "سنتر كيتشن-تحويل-جست", isCentralKitchen: true });
    await branchRepo.save(ck);
    ckBranchId = ck.id;
    const branch = Branch.register({ name: "فرع-تحويل-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const itemRepo = new KyselyInventoryItemRepository(db);
    const flour = InventoryItem.register({ name: "دقيق-تحويل-جست", unit: "كيلو", unitCost: 10 });
    await itemRepo.save(flour);
    flourItemId = flour.id;

    // رصيد ابتدائي للسنتر كيتشن (100 كيلو دقيق)
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: flourItemId, branchId: ckBranchId, movementType: "RECEIPT", quantityDelta: 100 });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM transfer_request_lines WHERE transfer_request_id IN (SELECT id FROM transfer_requests WHERE from_branch_id = ${ckBranchId})`.execute(db);
    await sql`DELETE FROM transfer_requests WHERE from_branch_id = ${ckBranchId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${flourItemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-transfer@jest.test'`.execute(db);
    await app.close();
  });

  let requestId: string;
  let lineId: string;

  test("POST /inventory/transfer-requests - فرع بيطلب من السنتر كيتشن -> SUBMITTED", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: branchId, lines: [{ inventoryItemId: flourItemId, requestedQuantity: 30 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.lines[0].requestedQuantity).toBe(30);
    requestId = res.body.id;
    lineId = res.body.lines[0].id;
  });

  test("مايصحش تحويل من فرع للفرع نفسه -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: ckBranchId, lines: [{ inventoryItemId: flourItemId, requestedQuantity: 5 }] });
    expect(res.status).toBe(400);
  });

  test("POST .../approve - السنتر كيتشن بيعتمد بكمية أقل -> APPROVED", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ approvedQuantities: { [lineId]: 25 } });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.lines[0].approvedQuantity).toBe(25);
  });

  test("POST .../dispatch - بيسجّل TRANSFER_OUT حقيقي عند السنتر كيتشن", async () => {
    const balanceBefore = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${ckBranchId}&inventoryItemId=${flourItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceBefore).toBe(100);

    const res = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${requestId}/dispatch`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DISPATCHED");
    expect(res.body.lines[0].dispatchedQuantity).toBe(25);

    const balanceAfter = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${ckBranchId}&inventoryItemId=${flourItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceAfter).toBe(75);
  });

  test("POST .../receive - استلام جزئي (فقد أثناء النقل) بيسجّل TRANSFER_IN بالكمية المستلمة فعليًا", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${requestId}/receive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantities: { [lineId]: 24 } }); // كيلو واحد فقد أثناء النقل
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("RECEIVED");
    expect(res.body.lines[0].receivedQuantity).toBe(24);

    const branchBalance = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${flourItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(branchBalance).toBe(24);
  });

  test("GET /inventory/transfer-requests?fromBranchId= بيرجّع السجل", async () => {
    const res = await request(app.getHttpServer())
      .get(`/inventory/transfer-requests?fromBranchId=${ckBranchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  test("POST .../cancel على طلب متسلّم بالفعل -> 400 (مش ممكن يتلغي بعد الاستلام)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "محاولة إلغاء متأخرة" });
    expect(res.status).toBe(400);
  });

  test("طلب تاني SUBMITTED -> إلغاء بسبب ناجح", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: branchId, lines: [{ inventoryItemId: flourItemId, requestedQuantity: 5 }] });
    const id = createRes.body.id;

    const withoutReason = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(withoutReason.status).toBe(400);

    const res = await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "الفرع اتراجع عن الطلب" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CANCELLED");
  });
});
