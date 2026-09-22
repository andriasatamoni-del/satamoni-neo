import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لمرفقات الصنف (modifiers) - من ضبطها في المنيو لحد استخدامها فعليًا في طلب حقيقي: سعر افتراضي،
// سعر مخصوص لحجم معيّن بيغلبه، والسعر النهائي بيتسجّل (snapshot) على سطر الطلب وقت البيع
describe("Catalog Modifiers - مرفقات الصنف", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let itemId: string;
  let smallVariantId: string;
  let largeVariantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مرفقات-جست", email: "admin-modifiers@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-modifiers@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع مرفقات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const itemRes = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بيتزا-مرفقات-جست" });
    itemId = itemRes.body.id;

    const smallRes = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "صغير", price: 60 });
    smallVariantId = smallRes.body.variants.find((v: { label: string }) => v.label === "صغير").id;

    const largeRes = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "كبير", price: 120 });
    largeVariantId = largeRes.body.variants.find((v: { label: string }) => v.label === "كبير").id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE menu_item_id = ${itemId})`.execute(db);
    await sql`DELETE FROM order_items WHERE menu_item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM print_jobs WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM menu_item_modifier_variant_prices WHERE modifier_id IN (SELECT id FROM menu_item_modifiers WHERE item_id = ${itemId})`.execute(db);
    await sql`DELETE FROM menu_item_modifiers WHERE item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE id = ${itemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-modifiers@jest.test'`.execute(db);
    await app.close();
  });

  let modifierId: string;

  test("POST /catalog/items/:id/modifiers - بيضيف مرفق جديد بسعر افتراضي", async () => {
    const res = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/modifiers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "إضافة جبنة", priceDelta: 10 });
    expect(res.status).toBe(201);
    const modifier = res.body.modifiers.find((m: { name: string }) => m.name === "إضافة جبنة");
    expect(modifier).toBeTruthy();
    expect(modifier.priceDelta).toBe(10);
    expect(modifier.isActive).toBe(true);
    modifierId = modifier.id;
  });

  test("POST نفس اسم المرفق مرتين -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/catalog/items/${itemId}/modifiers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "إضافة جبنة", priceDelta: 5 });
    expect(res.status).toBe(400);
  });

  test("PUT variant-prices - سعر مخصوص للمرفق على الحجم الكبير", async () => {
    const res = await request(app.getHttpServer())
      .put(`/catalog/items/${itemId}/modifiers/${modifierId}/variant-prices/${largeVariantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priceDelta: 18 });
    expect(res.status).toBe(200);
    const modifier = res.body.modifiers.find((m: { id: string }) => m.id === modifierId);
    expect(modifier.variantPrices).toEqual([{ variantId: largeVariantId, priceDelta: 18 }]);
  });

  test("POST /orders بمرفق - الحجم الصغير بياخد السعر الافتراضي، الكبير بياخد السعر المخصوص", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId,
        orderType: "takeaway",
        items: [
          { variantId: smallVariantId, quantity: 2, modifierIds: [modifierId] },
          { variantId: largeVariantId, quantity: 1, modifierIds: [modifierId] },
        ],
      });
    expect(res.status).toBe(201);

    const smallLine = res.body.items.find((i: { variantId: string }) => i.variantId === smallVariantId);
    expect(smallLine.unitPrice).toBe(70); // 60 + 10 (افتراضي)
    expect(smallLine.lineTotal).toBe(140); // 70 × 2
    expect(smallLine.modifiers).toEqual([{ modifierId, nameAtSale: "إضافة جبنة", priceAtSale: 10 }]);

    const largeLine = res.body.items.find((i: { variantId: string }) => i.variantId === largeVariantId);
    expect(largeLine.unitPrice).toBe(138); // 120 + 18 (مخصوص)
    expect(largeLine.modifiers).toEqual([{ modifierId, nameAtSale: "إضافة جبنة", priceAtSale: 18 }]);

    expect(res.body.total).toBe(140 + 138);
  });

  test("DELETE variant-prices - إلغاء السعر المخصوص يرجّع الحجم الكبير للسعر الافتراضي", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/catalog/items/${itemId}/modifiers/${modifierId}/variant-prices/${largeVariantId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const modifier = res.body.modifiers.find((m: { id: string }) => m.id === modifierId);
    expect(modifier.variantPrices).toEqual([]);

    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId: largeVariantId, quantity: 1, modifierIds: [modifierId] }] });
    expect(orderRes.body.items[0].unitPrice).toBe(130); // 120 + 10 (افتراضي بعد ما اتشال المخصوص)
  });

  test("PATCH modifier - بيقفّل المرفق (isActive=false)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/items/${itemId}/modifiers/${modifierId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.modifiers.find((m: { id: string }) => m.id === modifierId).isActive).toBe(false);
  });

  test("POST /orders بمرفق مقفول -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId: smallVariantId, quantity: 1, modifierIds: [modifierId] }] });
    expect(res.status).toBe(400);
  });

  test("POST /orders بمرفق مش موجود خالص -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId, orderType: "takeaway",
        items: [{ variantId: smallVariantId, quantity: 1, modifierIds: ["00000000-0000-0000-0000-000000000000"] }],
      });
    expect(res.status).toBe(400);
  });
});
