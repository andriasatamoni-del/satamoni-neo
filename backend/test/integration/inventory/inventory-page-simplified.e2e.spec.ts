import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import {
  branchStockBalances,
  inventoryItems,
  stockMovements,
  transferRequestLines,
  transferRequests,
} from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { menuItems, menuItemVariants, recipeIngredients, recipes, recipeVersions } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { createSecondUser } from "../helpers/second-user";

describe("Inventory page: branch stock, item removal and branch transfers", () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let managerToken: string;
  let accountantToken: string;
  let branchAId: string;
  let branchBId: string;
  let riceId: string;
  let oilId: string;
  let menuItemId: string;
  const createdItemIds: string[] = [];
  const emails = ["inv-simple-admin@jest.test", "inv-simple-manager@jest.test", "inv-simple-accountant@jest.test"];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function balanceOf(branchId: string, itemId: string): Promise<number> {
    const [row] = await db
      .select({ quantity: branchStockBalances.quantity })
      .from(branchStockBalances)
      .where(and(eq(branchStockBalances.branch_id, branchId), eq(branchStockBalances.inventory_item_id, itemId)));
    return Number(row?.quantity ?? 0);
  }

  async function createItem(name: string): Promise<string> {
    const res = await http().post("/inventory/items").set(auth(adminToken)).send({ name, unit: "كيلو", itemType: "raw" });
    expect(res.status).toBe(201);
    createdItemIds.push(res.body.id);
    return res.body.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);

    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const branchRepo = new BranchRepository(db);
    const branchA = Branch.register({ name: "فرع-أ-مخزون-مبسط" });
    const branchB = Branch.register({ name: "فرع-ب-مخزون-مبسط" });
    await branchRepo.save(branchA);
    await branchRepo.save(branchB);
    branchAId = branchA.id;
    branchBId = branchB.id;

    adminToken = (await createSecondUser(app, emails[0], "admin")).token;
    managerToken = (await createSecondUser(app, emails[1], "branch_manager", branchAId)).token;
    accountantToken = (await createSecondUser(app, emails[2], "accountant")).token;

    riceId = await createItem("أرز-مخزون-مبسط");
    oilId = await createItem("زيت-مخزون-مبسط");

    const receipt = await http()
      .post("/inventory/movements")
      .set(auth(adminToken))
      .send({ inventoryItemId: riceId, branchId: branchAId, movementType: "RECEIPT", quantityDelta: 50 });
    expect(receipt.status).toBe(201);
  });

  afterAll(async () => {
    const transferIds = db.select({ id: transferRequests.id }).from(transferRequests).where(inArray(transferRequests.from_branch_id, [branchAId, branchBId]));
    await db.delete(transferRequestLines).where(inArray(transferRequestLines.transfer_request_id, transferIds));
    await db.delete(transferRequests).where(inArray(transferRequests.from_branch_id, [branchAId, branchBId]));
    if (menuItemId) await db.delete(menuItems).where(eq(menuItems.id, menuItemId));
    await db.delete(recipes).where(eq(recipes.name, "وصفة-مخزون-مبسط"));
    await db.delete(stockMovements).where(inArray(stockMovements.branch_id, [branchAId, branchBId]));
    await db.delete(branchStockBalances).where(inArray(branchStockBalances.branch_id, [branchAId, branchBId]));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, createdItemIds));
    await db.delete(users).where(inArray(users.email, emails));
    await db.delete(branches).where(inArray(branches.id, [branchAId, branchBId]));
    await app.close();
  });

  it("lists every active item with its quantity in the chosen branch", async () => {
    const res = await http().get(`/inventory/branch-stock?branchId=${branchAId}&q=مخزون-مبسط&paginate=1`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const byId = new Map(res.body.items.map((r: { inventoryItemId: string; quantity: number }) => [r.inventoryItemId, r.quantity]));
    expect(byId.get(riceId)).toBe(50);
    expect(byId.get(oilId)).toBe(0);
  });

  it("keeps a branch manager on their own branch's stock", async () => {
    const own = await http().get(`/inventory/branch-stock?q=مخزون-مبسط`).set(auth(managerToken));
    expect(own.status).toBe(200);
    expect(own.body.find((r: { inventoryItemId: string }) => r.inventoryItemId === riceId).quantity).toBe(50);

    const foreign = await http().get(`/inventory/branch-stock?branchId=${branchBId}`).set(auth(managerToken));
    expect(foreign.status).toBe(403);
  });

  it("lets a branch manager register a transfer that moves the stock at once", async () => {
    const res = await http()
      .post("/inventory/transfers")
      .set(auth(managerToken))
      .send({ fromBranchId: branchAId, toBranchId: branchBId, notes: "تحويل اختبار", lines: [{ inventoryItemId: riceId, quantity: 20 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("RECEIVED");
    expect(res.body.lines[0].receivedQuantity).toBe(20);
    expect(await balanceOf(branchAId, riceId)).toBe(30);
    expect(await balanceOf(branchBId, riceId)).toBe(20);
  });

  it("refuses a transfer out of another branch", async () => {
    const res = await http()
      .post("/inventory/transfers")
      .set(auth(managerToken))
      .send({ fromBranchId: branchBId, toBranchId: branchAId, lines: [{ inventoryItemId: riceId, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it("refuses a transfer from a role without the transfer permission", async () => {
    const res = await http()
      .post("/inventory/transfers")
      .set(auth(accountantToken))
      .send({ fromBranchId: branchAId, toBranchId: branchBId, lines: [{ inventoryItemId: riceId, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it("rolls the whole transfer back when the source branch lacks stock", async () => {
    const res = await http()
      .post("/inventory/transfers")
      .set(auth(managerToken))
      .send({ fromBranchId: branchAId, toBranchId: branchBId, lines: [{ inventoryItemId: riceId, quantity: 5 }, { inventoryItemId: oilId, quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(await balanceOf(branchAId, riceId)).toBe(30);
    expect(await balanceOf(branchBId, riceId)).toBe(20);
  });

  it("refuses to remove an item a product's recipe uses and names the product", async () => {
    const [menuItem] = await db.insert(menuItems).values({ name: "طبق-مخزون-مبسط" }).returning({ id: menuItems.id });
    menuItemId = menuItem.id;
    const [recipe] = await db.insert(recipes).values({ recipe_type: "sellable_variant", name: "وصفة-مخزون-مبسط" }).returning({ id: recipes.id });
    await db.insert(menuItemVariants).values({ item_id: menuItemId, label: "كبير", price: 100, talabat_price: 110, recipe_id: recipe.id });
    const [version] = await db.insert(recipeVersions).values({ recipe_id: recipe.id, version_number: 1, status: "ACTIVE" }).returning({ id: recipeVersions.id });
    await db.insert(recipeIngredients).values({ recipe_version_id: version.id, ingredient_item_id: oilId, quantity: 0.1 });

    const res = await http().delete(`/inventory/items/${oilId}`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("طبق-مخزون-مبسط (كبير)");

    const list = await http().get("/inventory/items?q=زيت-مخزون-مبسط").set(auth(adminToken));
    expect(list.body.map((i: { id: string }) => i.id)).toContain(oilId);
  });

  it("archives an unlinked item, hides it and frees its name", async () => {
    const res = await http().delete(`/inventory/items/${riceId}`).set(auth(adminToken));
    expect(res.status).toBe(200);

    const list = await http().get("/inventory/items?q=أرز-مخزون-مبسط").set(auth(adminToken));
    expect(list.body).toEqual([]);
    const stock = await http().get(`/inventory/branch-stock?branchId=${branchAId}&q=أرز-مخزون-مبسط`).set(auth(adminToken));
    expect(stock.body).toEqual([]);

    const again = await http().delete(`/inventory/items/${riceId}`).set(auth(adminToken));
    expect(again.status).toBe(409);

    await createItem("أرز-مخزون-مبسط");
  });

  it("refuses item removal without the manage permission", async () => {
    const res = await http().delete(`/inventory/items/${oilId}`).set(auth(managerToken));
    expect(res.status).toBe(403);
  });
});
