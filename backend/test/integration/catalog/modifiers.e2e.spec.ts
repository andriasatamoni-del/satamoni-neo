import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemModifierVariantPrices, menuItemModifiers, menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItemModifiers, orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

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

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مرفقات-جست", email: "admin-modifiers@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-modifiers@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
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
    const db = app.get<Database>(DATABASE);
    await db.delete(orderItemModifiers).where(inArray(orderItemModifiers.order_item_id, db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.menu_item_id, itemId))));
    await db.delete(orderItems).where(eq(orderItems.menu_item_id, itemId));
    await db.delete(printJobs).where(inArray(printJobs.order_id, db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(menuItemModifierVariantPrices).where(inArray(menuItemModifierVariantPrices.modifier_id, db.select({ id: menuItemModifiers.id }).from(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId))));
    await db.delete(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.item_id, itemId));
    await db.delete(menuItems).where(eq(menuItems.id, itemId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-modifiers@jest.test"));
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
