import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, like } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, branchStockThresholds, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import type { Database } from "../../../src/shared/database/database.token";

describe("Inventory - /inventory (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;

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

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مخزون", email: "admin-inventory@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-inventory@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع مخزون-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(branchStockThresholds).where(eq(branchStockThresholds.branch_id, branchId));
    await db.delete(branchStockBalances);
    await db.delete(stockMovements);
    await db.delete(inventoryItems).where(like(inventoryItems.name, "%-e2e-جست"));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-inventory@jest.test"));
    await app.close();
  });

  let itemId: string;

  test("POST /inventory/items بتوكن أدمن - بيعمل صنف جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "دقيق-e2e-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    expect(res.status).toBe(201);
    itemId = res.body.id;
  });

  test("POST /inventory/items بنفس الاسم -> 400 (مكرر)", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "دقيق-e2e-جست", unit: "كيلو" });
    expect(res.status).toBe(400);
  });

  test("POST /inventory/movements - استلام بضاعة بيزوّد الرصيد", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: itemId, branchId, movementType: "RECEIPT", quantityDelta: 20 });
    expect(res.status).toBe(201);
    expect(res.body.balanceAfter).toBe(20);
  });

  test("GET /inventory/balances بيرجّع الرصيد الحالي", async () => {
    const res = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${itemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(20);
  });

  test("حركة استهلاك هتخلي الرصيد سالب من غير موافقة -> 409", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: itemId, branchId, movementType: "CONSUMPTION", quantityDelta: -50 });
    expect(res.status).toBe(409);
  });

  test("POST /inventory/movements بصنف مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: "00000000-0000-0000-0000-000000000000", branchId, movementType: "RECEIPT", quantityDelta: 1 });
    expect(res.status).toBe(404);
  });

  test("GET /inventory/stock-thresholds قبل الضبط بيرجّع حدود فاضية (كله null)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/inventory/stock-thresholds?branchId=${branchId}&inventoryItemId=${itemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.reorderPoint).toBeNull();
  });

  test("PATCH /inventory/stock-thresholds بقيمة سالبة -> 400", async () => {
    const res = await request(app.getHttpServer())
      .patch("/inventory/stock-thresholds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, inventoryItemId: itemId, reorderPoint: -5 });
    expect(res.status).toBe(400);
  });

  test("PATCH /inventory/stock-thresholds ثم GET /inventory/low-stock بيعكس الرصيد الحقيقي فعليًا", async () => {
    // الرصيد الحالي للصنف ده 20 (من اختبار الاستلام فوق) - نضبط حد إعادة طلب 30 عشان يظهر NEEDS_REORDER
    const patchRes = await request(app.getHttpServer())
      .patch("/inventory/stock-thresholds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, inventoryItemId: itemId, reorderPoint: 30 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.reorderPoint).toBe(30);
    expect(patchRes.body.updatedBy).toBeTruthy();

    const lowStockRes = await request(app.getHttpServer())
      .get(`/inventory/low-stock?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(lowStockRes.status).toBe(200);
    const row = lowStockRes.body.find((r: { inventoryItemId: string }) => r.inventoryItemId === itemId);
    expect(row).toBeTruthy();
    expect(row.status).toBe("NEEDS_REORDER");
    expect(row.quantity).toBe(20);

    // نزوّد الرصيد فوق حد إعادة الطلب - المفروض يختفي من قايمة النواقص
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: itemId, branchId, movementType: "RECEIPT", quantityDelta: 50 });

    const afterRes = await request(app.getHttpServer())
      .get(`/inventory/low-stock?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(afterRes.body.some((r: { inventoryItemId: string }) => r.inventoryItemId === itemId)).toBe(false);
  });
});
