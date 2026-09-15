import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Catalog - /catalog (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let ingredientItemId: string;

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
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-كتالوج", email: "admin-catalog@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-catalog@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "جبنة-كتالوج-e2e-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM menu_categories`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-catalog@jest.test'`.execute(db);
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

  test("POST /catalog/items بدون صلاحية catalog.items.manage -> 403", async () => {
    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const repo = new KyselyUserRepository(db);
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

    await sql`DELETE FROM users WHERE email = 'cashier-catalog@jest.test'`.execute(db);
  });
});
