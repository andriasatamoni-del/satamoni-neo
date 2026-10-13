import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { menuItemModifierVariantPrices, menuItemModifiers, menuItemVariants, menuItems, menuPriceHistory } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";

describe("Catalog - سجل تاريخ أسعار المنيو (HIST-2, e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let itemId: string;
  let variantId: string;
  let modifierId: string;

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

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-سجل-أسعار", email: "admin-price-history@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-price-history@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const itemRes = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بيتزا-سجل-أسعار-جست", variants: [{ label: "وسط", price: 100, talabatPrice: 110 }] });
    itemId = itemRes.body.id;
    variantId = itemRes.body.variants[0].id;

    const modifierRes = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/modifiers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "جبنة إضافية-جست", priceDelta: 10 });
    modifierId = modifierRes.body.modifiers[0].id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(menuPriceHistory).where(inArray(menuPriceHistory.entity_id, [variantId, modifierId]));
    await db.delete(menuItemModifierVariantPrices).where(eq(menuItemModifierVariantPrices.modifier_id, modifierId));
    await db.delete(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.item_id, itemId));
    await db.delete(menuItems).where(eq(menuItems.id, itemId));
    await db.delete(users).where(eq(users.email, "admin-price-history@jest.test"));
    await app.close();
  });

  test("PATCH variant price بيسجّل صف تاريخ (price + talabat_price)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}/variants/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 120, talabatPrice: 130 });
    expect(res.status).toBe(200);

    const history = await request(app.getHttpServer())
      .get(`/catalog/items/${itemId}/variants/${variantId}/price-history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(2);
    const priceRow = history.body.find((h: { fieldName: string }) => h.fieldName === "price");
    expect(priceRow.oldPrice).toBe(100);
    expect(priceRow.newPrice).toBe(120);
    expect(priceRow.changedByName).toBe("أدمن-سجل-أسعار");
    const talabatRow = history.body.find((h: { fieldName: string }) => h.fieldName === "talabat_price");
    expect(talabatRow.oldPrice).toBe(110);
    expect(talabatRow.newPrice).toBe(130);
  });

  test("PATCH variant price بنفس السعر - مفيش صف جديد يتسجّل", async () => {
    await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}/variants/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 120 });

    const history = await request(app.getHttpServer())
      .get(`/catalog/items/${itemId}/variants/${variantId}/price-history`)
      .set("Authorization", `Bearer ${adminToken}`);
    const priceRows = history.body.filter((h: { fieldName: string }) => h.fieldName === "price");
    expect(priceRows).toHaveLength(1);
  });

  test("PATCH modifier priceDelta بيسجّل صف تاريخ", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}/modifiers/${modifierId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceDelta: 15 });
    expect(res.status).toBe(200);

    const history = await request(app.getHttpServer())
      .get(`/catalog/items/${itemId}/modifiers/${modifierId}/price-history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].oldPrice).toBe(10);
    expect(history.body[0].newPrice).toBe(15);
  });

  test("PUT modifier variant-price مخصوص بيسجّل صف تاريخ من نوع modifier_variant_price", async () => {
    const res = await request(app.getHttpServer())
      .put(`/catalog/items/${itemId}/modifiers/${modifierId}/variant-prices/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceDelta: 25 });
    expect(res.status).toBe(200);

    const history = await request(app.getHttpServer())
      .get(`/catalog/items/${itemId}/modifiers/${modifierId}/price-history?variantId=${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].oldPrice).toBeNull();
    expect(history.body[0].newPrice).toBe(25);
    expect(history.body[0].variantId).toBe(variantId);

    // مش المفروض يظهر في سجل المرفق العام (بدون variantId) - النوعين منفصلين
    const generalHistory = await request(app.getHttpServer())
      .get(`/catalog/items/${itemId}/modifiers/${modifierId}/price-history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(generalHistory.body).toHaveLength(1);
    expect(generalHistory.body[0].fieldName).toBe("price_delta");
    expect(generalHistory.body[0].newPrice).toBe(15);
  });
});
