import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Inventory - جرد فعلي (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let itemWithCostId: string;
  let itemNoCostId: string;

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
    const { KyselyAccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-جرد-جست", email: "admin-stocktake@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-stocktake@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع جرد-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const itemWithCost = InventoryItem.register({ name: "أرز-جرد-جست", unit: "كيلو", unitCost: 20 });
    await inventoryRepo.save(itemWithCost);
    itemWithCostId = itemWithCost.id;
    const itemNoCost = InventoryItem.register({ name: "سكر-جرد-جست", unit: "كيلو" });
    await inventoryRepo.save(itemNoCost);
    itemNoCostId = itemNoCost.id;

    const accountRepo = new KyselyAccountRepository(db);
    const inventoryAccount = Account.register({ code: "1400", name: "المخزون", accountType: "ASSET", isSystemAccount: true });
    const wastageAccount = Account.register({ code: "5300", name: "تكلفة بضاعة مباعة أخرى", accountType: "COGS", isSystemAccount: true });
    await accountRepo.save(inventoryAccount);
    await accountRepo.save(wastageAccount);

    // نبدأ برصيد معروف للصنفين (10 كيلو لكل واحد) عن طريق حركة RECEIPT حقيقية
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: itemWithCostId, branchId, movementType: "RECEIPT", quantityDelta: 10 });
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: itemNoCostId, branchId, movementType: "RECEIPT", quantityDelta: 10 });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM stocktake_lines WHERE stocktake_id IN (SELECT id FROM stocktakes WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM stocktakes WHERE branch_id = ${branchId}`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE code IN ('1400', '5300')`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${itemWithCostId}, ${itemNoCostId})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-stocktake@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /inventory/stocktakes/board - بيرجّع كل الأصناف مع رصيد النظام الحالي", async () => {
    const res = await request(app.getHttpServer())
      .get(`/inventory/stocktakes/board?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { inventoryItemId: string }) => r.inventoryItemId === itemWithCostId);
    expect(row.systemQuantity).toBe(10);
  });

  test("POST /inventory/stocktakes - عجز في صنف بتكلفة معروفة -> يترحّل قيد فرق (مدين 5300/دائن 1400)", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/inventory/stocktakes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId,
        notes: "جرد شهري",
        lines: [
          { inventoryItemId: itemWithCostId, actualQuantity: 7 }, // عجز 3 كيلو × 20ج = 60ج
          { inventoryItemId: itemNoCostId, actualQuantity: 10 }, // مطابق تمامًا - مش هيتسجل كسطر
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(1); // السطر المطابق مش موجود
    expect(res.body.lines[0].inventoryItemId).toBe(itemWithCostId);
    expect(res.body.lines[0].varianceQuantity).toBe(-3);
    expect(res.body.lines[0].varianceValue).toBe(-60);
    expect(res.body.totalVarianceValue).toBe(-60);

    const balanceAfter = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${itemWithCostId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceAfter).toBe(7);

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore + 1);
  });

  test("POST /inventory/stocktakes - زيادة في صنف من غير unit_cost -> يترحّل السطر بس من غير قيمة/قيد", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/inventory/stocktakes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, lines: [{ inventoryItemId: itemNoCostId, actualQuantity: 12 }] }); // زيادة 2 كيلو، بس مفيش unit_cost
    expect(res.status).toBe(201);
    expect(res.body.lines[0].varianceQuantity).toBe(2);
    expect(res.body.lines[0].varianceValue).toBeNull();
    expect(res.body.lines[0].chargeAccountCode).toBeNull();
    expect(res.body.totalVarianceValue).toBe(0);

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore); // مفيش قيد جديد (مفيش قيمة تترحّل)
  });

  test("POST /inventory/stocktakes - كل البنود مطابقة -> الجلسة بتتسجل من غير سطور خالص", async () => {
    const res = await request(app.getHttpServer())
      .post("/inventory/stocktakes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, lines: [{ inventoryItemId: itemWithCostId, actualQuantity: 7 }] }); // زي رصيد النظام بالظبط دلوقتي
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(0);
    expect(res.body.totalVarianceValue).toBe(0);
  });

  test("GET /inventory/stocktakes و GET /inventory/stocktakes/:id بيرجّعوا السجل صح", async () => {
    const list = await request(app.getHttpServer())
      .get(`/inventory/stocktakes?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(3);

    const detail = await request(app.getHttpServer())
      .get(`/inventory/stocktakes/${list.body[0].id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(list.body[0].id);
  });

  test("GET /inventory/stocktakes/:id بمعرّف مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .get("/inventory/stocktakes/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test("كاشير معندوش inventory.movements.record -> 403 على تسجيل جرد", async () => {
    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({
      name: "كاشير-جرد-جست", email: "cashier-stocktake@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-stocktake@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .post("/inventory/stocktakes")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send({ branchId, lines: [{ inventoryItemId: itemWithCostId, actualQuantity: 5 }] });
    expect(res.status).toBe(403);

    await sql`DELETE FROM users WHERE email = 'cashier-stocktake@jest.test'`.execute(db);
  });
});
