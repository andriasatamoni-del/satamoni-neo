import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Procurement - /procurement (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let inventoryItemId: string;
  let supplierId: string;

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
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مشتريات", email: "admin-procurement@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-procurement@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع مشتريات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const item = InventoryItem.register({ name: "أرز-مشتريات-جست", unit: "كيلو" });
    await inventoryRepo.save(item);
    inventoryItemId = item.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM goods_receipt_items`.execute(db);
    await sql`DELETE FROM goods_receipts`.execute(db);
    await sql`DELETE FROM purchase_order_items`.execute(db);
    await sql`DELETE FROM purchase_orders`.execute(db);
    await sql`DELETE FROM suppliers`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${inventoryItemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-procurement@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /procurement/suppliers - بيعمل مورد جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/procurement/suppliers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مورد-e2e-جست" });
    expect(res.status).toBe(201);
    supplierId = res.body.id;
  });

  test("POST /procurement/purchase-orders - بيعمل أمر شراء رسمي", async () => {
    const res = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 100, unitPrice: 10 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
  });

  test("POST /procurement/goods-receipts (PO-less) + confirm - بيرحّل حركة مخزون حقيقية", async () => {
    const balanceBefore = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${inventoryItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceBefore.body.quantity).toBe(0);

    const created = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, lines: [{ inventoryItemId, quantity: 25, unitCost: 12 }] });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("DRAFT");
    expect(created.body.purchaseOrderId).toBeNull();

    const confirmed = await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe("CONFIRMED");

    const balanceAfter = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${inventoryItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceAfter.body.quantity).toBe(25);
  });

  test("تأكيد إذن استلام مؤكد بالفعل -> 400", async () => {
    const created = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, lines: [{ inventoryItemId, quantity: 5, unitCost: 10 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test("POST /procurement/purchase-orders بمورد مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId: "00000000-0000-0000-0000-000000000000", branchId, lines: [{ inventoryItemId, quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(404);
  });

  test("GET /procurement/goods-receipts?branchId= بيرجّع أذون الفرع بس", async () => {
    const res = await request(app.getHttpServer())
      .get(`/procurement/goods-receipts?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((r: { branchId: string }) => r.branchId === branchId)).toBe(true);
  });
});
