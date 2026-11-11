import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { comboItems, combos, menuItemVariants, menuItems, menuPriceHistory } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

const TAG = "سعر-طلبات-جست";
const ADMIN_EMAIL = "admin-talabat-price@jest.test";

describe("Talabat menu prices (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let itemId: string;
  let pricedVariantId: string;
  let largeVariantId: string;
  let addonId: string;
  let addonVariantId: string;
  let comboId: string;

  const api = () => request(app.getHttpServer());
  const asAdmin = (test: request.Test) => test.set("Authorization", `Bearer ${adminToken}`);
  const placeOrder = (body: object) => asAdmin(api().post("/orders")).send({ branchId, orderType: "takeaway", ...body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const db = app.get<Database>(DATABASE);
    const admin = User.register({ name: `أدمن-${TAG}`, email: ADMIN_EMAIL, passwordHash: await new BcryptPasswordHasher().hash("12345678"), roles: ["admin"] });
    await new UserRepository(db).save(admin);
    adminToken = (await api().post("/auth/login").send({ email: ADMIN_EMAIL, password: "12345678" })).body.token;

    const branch = Branch.register({ name: `فرع-${TAG}` });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const created = await asAdmin(api().post("/catalog/items")).send({
      name: `فطير-${TAG}`,
      variants: [{ label: "صغير", price: 50, talabatPrice: 60 }, { label: "كبير", price: 80, talabatPrice: 112 }],
    });
    expect(created.status).toBe(201);
    itemId = created.body.id;
    pricedVariantId = created.body.variants[0].id;
    largeVariantId = created.body.variants[1].id;

    const addon = await asAdmin(api().post("/catalog/items")).send({
      kind: "addon",
      name: `جبنة زيادة-${TAG}`,
      variants: [{ label: "عادي", price: 10, talabatPrice: 14 }],
    });
    addonId = addon.body.id;
    addonVariantId = addon.body.variants[0].id;

    const combo = await asAdmin(api().post("/catalog/combos")).send({ name: `عرض-${TAG}`, price: 40, items: [{ variantId: pricedVariantId, quantity: 1 }] });
    comboId = combo.body.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(printJobs);
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(comboItems);
    await db.delete(combos).where(like(combos.name, `%${TAG}%`));
    await db.delete(menuPriceHistory).where(inArray(menuPriceHistory.entity_id, [pricedVariantId, largeVariantId]));
    await db.delete(menuItemVariants).where(inArray(menuItemVariants.item_id, [itemId, addonId]));
    await db.delete(menuItems).where(inArray(menuItems.id, [itemId, addonId]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
    await app.close();
  });

  test("an order without a source stays a POS order at the normal price", async () => {
    const res = await placeOrder({ items: [{ variantId: pricedVariantId, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("pos");
    expect(res.body.total).toBe(100);
  });

  test("a Talabat order uses the Talabat price for the item and its addons", async () => {
    const res = await placeOrder({ source: "talabat", items: [{ variantId: pricedVariantId, quantity: 2, addons: [{ variantId: addonVariantId, quantity: 1 }] }] });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("talabat");
    expect(res.body.items[0].unitPrice).toBe(60);
    expect(res.body.items[0].addons[0]).toEqual(expect.objectContaining({ quantity: 2, unitPrice: 14, lineTotal: 28 }));
    expect(res.body.total).toBe(148);
  });

  test("a menu item cannot be created without a Talabat price", async () => {
    const res = await asAdmin(api().post("/catalog/items")).send({ name: `بدون-سعر-${TAG}`, variants: [{ label: "عادي", price: 30 }] });
    expect(res.status).toBe(400);
  });

  test("a size cannot be added without a Talabat price", async () => {
    const res = await asAdmin(api().post(`/catalog/items/${itemId}/variants`)).send({ label: "وسط", price: 65 });
    expect(res.status).toBe(400);
  });

  test("a Talabat order refuses combos", async () => {
    const res = await placeOrder({ source: "talabat", items: [{ comboId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("the orders endpoint refuses sources that do not belong to the POS", async () => {
    const res = await placeOrder({ source: "website", items: [{ variantId: pricedVariantId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("editing the Talabat price leaves the normal price alone and is logged separately", async () => {
    const res = await asAdmin(api().patch(`/catalog/items/${itemId}/variants/${pricedVariantId}`)).send({ talabatPrice: 65 });
    expect(res.status).toBe(200);
    const variant = res.body.variants.find((v: { id: string }) => v.id === pricedVariantId);
    expect(variant).toMatchObject({ price: 50, talabatPrice: 65 });

    const history = await asAdmin(api().get(`/catalog/items/${itemId}/variants/${pricedVariantId}/price-history`));
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ fieldName: "talabat_price", oldPrice: 60, newPrice: 65 });
  });

  test("editing the normal price leaves the Talabat price alone", async () => {
    const res = await asAdmin(api().patch(`/catalog/items/${itemId}/variants/${pricedVariantId}`)).send({ price: 55 });
    expect(res.body.variants.find((v: { id: string }) => v.id === pricedVariantId)).toMatchObject({ price: 55, talabatPrice: 65 });
  });

  test("neither price can be cleared", async () => {
    const url = `/catalog/items/${itemId}/variants/${pricedVariantId}`;
    expect((await asAdmin(api().patch(url)).send({ talabatPrice: null })).status).toBe(400);
    expect((await asAdmin(api().patch(url)).send({ price: null })).status).toBe(400);
  });

  test("a variant update must carry a price", async () => {
    const res = await asAdmin(api().patch(`/catalog/items/${itemId}/variants/${pricedVariantId}`)).send({});
    expect(res.status).toBe(400);
  });
});
