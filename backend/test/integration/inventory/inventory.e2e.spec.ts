import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Inventory - /inventory (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;

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

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مخزون", email: "admin-inventory@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-inventory@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع مخزون-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM branch_stock_balances`.execute(db);
    await sql`DELETE FROM stock_movements`.execute(db);
    await sql`DELETE FROM inventory_items WHERE name LIKE '%-e2e-جست'`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-inventory@jest.test'`.execute(db);
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
});
