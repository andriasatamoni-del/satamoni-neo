import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq } from "drizzle-orm";
import { menuCategories, menuItemVariants, menuItems, menuPriceHistory, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";

describe("Catalog - /catalog (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let ingredientItemId: string;

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
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-كتالوج", email: "admin-catalog@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-catalog@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const ingredient = InventoryItem.register({ name: "جبنة-كتالوج-e2e-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
    await db.delete(menuPriceHistory);
    await db.delete(menuItemVariants);
    await db.delete(menuItems);
    await db.delete(menuCategories);
    await db.delete(inventoryItems).where(eq(inventoryItems.id, ingredientItemId));
    await db.delete(users).where(eq(users.email, "admin-catalog@jest.test"));
    await app.close();
  });

  let itemId: string;
  let variantId: string;
  let recipeId: string;
  let versionId: string;

  test("POST /catalog/categories - بيعمل قسم جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بيتزا-e2e-جست" });
    expect(res.status).toBe(201);
  });

  test("POST /catalog/items - بيعمل صنف بحجم واحد", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مارجريتا-e2e-جست", variants: [{ label: "وسط", price: 90 }] });
    expect(res.status).toBe(201);
    expect(res.body.variants).toHaveLength(1);
    itemId = res.body.id;
    variantId = res.body.variants[0].id;
  });

  test("POST /catalog/items/:id/variants - بيضيف حجم تاني", async () => {
    const res = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "كبير", price: 130 });
    expect(res.status).toBe(201);
    expect(res.body.variants).toHaveLength(2);
  });

  test("POST /catalog/recipes - بيعمل وصفة للحجم", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/recipes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ recipeType: "sellable_variant", variantId });
    expect(res.status).toBe(201);
    recipeId = res.body.id;
  });

  test("POST /catalog/recipes/:id/versions - بيعمل نسخة DRAFT بمكوّناتها", async () => {
    const res = await request(app.getHttpServer())
      .post(`/catalog/recipes/${recipeId}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ingredients: [{ ingredientItemId, quantity: 0.25, unit: "كيلو" }] });
    expect(res.status).toBe(201);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].status).toBe("DRAFT");
    versionId = res.body.versions[0].id;
  });

  test("POST /catalog/recipes/:id/versions/:versionId/activate - بيفعّل النسخة", async () => {
    const res = await request(app.getHttpServer())
      .post(`/catalog/recipes/${recipeId}/versions/${versionId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.versions[0].status).toBe("ACTIVE");
  });

  test("GET /catalog/variants/:variantId/recipe - بيرجّع الوصفة بنسختها النشطة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/catalog/variants/${variantId}/recipe`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.versions[0].status).toBe("ACTIVE");
  });

  test("PATCH /catalog/items/:id/variants/:variantId - بيعدّل السعر", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}/variants/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 95 });
    expect(res.status).toBe(200);
    const updated = res.body.variants.find((v: { id: string }) => v.id === variantId);
    expect(updated.price).toBe(95);
  });

  test("PATCH /catalog/items/:id - بيعدّل الاسم ويعطّل الصنف", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مارجريتا معدّلة-e2e-جست", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("مارجريتا معدّلة-e2e-جست");
    expect(res.body.isActive).toBe(false);

    // نرجّعه نشط تاني عشان مايأثرش على استخدامه في اختبارات لاحقة لو اتضافت
    await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
  });

  test("PATCH /catalog/items/:id لصنف مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "أي حاجة" });
    expect(res.status).toBe(404);
  });

  test("PATCH /catalog/categories/:id - بيعطّل القسم ويرجّعه تاني", async () => {
    const categoriesRes = await request(app.getHttpServer())
      .get("/catalog/categories")
      .set("Authorization", `Bearer ${adminToken}`);
    const category = categoriesRes.body.find((c: { name: string }) => c.name === "بيتزا-e2e-جست");

    const deactivateRes = await request(app.getHttpServer())
      .patch(`/catalog/categories/${category.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.isActive).toBe(false);

    const reactivateRes = await request(app.getHttpServer())
      .patch(`/catalog/categories/${category.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بيتزا معدّلة-e2e-جست", isActive: true });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.name).toBe("بيتزا معدّلة-e2e-جست");
    expect(reactivateRes.body.isActive).toBe(true);
  });

  test("POST /catalog/items بدون صلاحية catalog.items.manage -> 403", async () => {
    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get<Database>(DATABASE);
    const repo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({
      name: "كاشير-كتالوج", email: "cashier-catalog@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await repo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-catalog@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send({ name: "ممنوع-جست" });
    expect(res.status).toBe(403);

    await db.delete(users).where(eq(users.email, "cashier-catalog@jest.test"));
  });
});
