import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, inArray } from "drizzle-orm";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements, stocktakeLines, stocktakes } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { truncate } from "../helpers/db";
import type { Database } from "../../../src/shared/database/database.token";

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
    const { AccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-جرد-جست", email: "admin-stocktake@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-stocktake@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع جرد-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const itemWithCost = InventoryItem.register({ name: "أرز-جرد-جست", unit: "كيلو", unitCost: 20 });
    await inventoryRepo.save(itemWithCost);
    itemWithCostId = itemWithCost.id;
    const itemNoCost = InventoryItem.register({ name: "سكر-جرد-جست", unit: "كيلو" });
    await inventoryRepo.save(itemNoCost);
    itemNoCostId = itemNoCost.id;

    const accountRepo = new AccountRepository(app.get<Database>(DATABASE));
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
    const db = app.get<Database>(DATABASE);
    await db.delete(stocktakeLines).where(inArray(stocktakeLines.stocktake_id, db.select({ id: stocktakes.id }).from(stocktakes).where(eq(stocktakes.branch_id, branchId))));
    await db.delete(stocktakes).where(eq(stocktakes.branch_id, branchId));
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(accounts).where(inArray(accounts.code, ["1400", "5300"]));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, [itemWithCostId, itemNoCostId]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-stocktake@jest.test"));
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
    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get<Database>(DATABASE);
    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({
      name: "كاشير-جرد-جست", email: "cashier-stocktake@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["cashier"],
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

    await db.delete(users).where(eq(users.email, "cashier-stocktake@jest.test"));
  });
});
