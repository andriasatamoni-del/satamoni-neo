import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { goodsReceiptItems, goodsReceipts, purchaseOrderItems, purchaseOrders, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";

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

    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { BranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مشتريات", email: "admin-procurement@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-procurement@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع مشتريات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const item = InventoryItem.register({ name: "أرز-مشتريات-جست", unit: "كيلو" });
    await inventoryRepo.save(item);
    inventoryItemId = item.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(goodsReceiptItems);
    await db.delete(goodsReceipts);
    await db.delete(purchaseOrderItems);
    await db.delete(purchaseOrders);
    await db.delete(suppliers);
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-procurement@jest.test"));
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

  test("POST /procurement/purchase-orders/:id/send ثم /cancel - دورة حياة أمر شراء كاملة", async () => {
    const created = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 10, unitPrice: 5 }] });
    expect(created.status).toBe(201);
    const poId = created.body.id;

    const sent = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe("SENT");

    // إرسال تاني لأمر شراء بقى SENT بالفعل -> 400 (مينفعش يتقدّم إلا وهو DRAFT)
    const sentAgain = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(sentAgain.status).toBe(400);

    const cancelled = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe("CANCELLED");

    // إلغاء تاني لأمر شراء اتلغى بالفعل -> 400
    const cancelledAgain = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelledAgain.status).toBe(400);
  });

  test("POST /procurement/purchase-orders/:id/send لأمر شراء مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/send")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
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

  test("تأكيد إذن استلام مؤكد بالفعل -> 409", async () => {
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
    expect(res.status).toBe(409);
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
