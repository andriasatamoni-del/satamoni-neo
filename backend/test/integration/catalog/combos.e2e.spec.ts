import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لإدارة العروض (combos/combo_items) - راجع تعليق combo.aggregate.ts للفلسفة (نفس مفهوم الريبو
// القديم بالظبط: أكتر من حجم بسعر واحد)
describe("Combos - العروض (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let variantAId: string;
  let variantBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-عروض-جست", email: "admin-combos@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-combos@jest.test", password: "12345678" })
    ).body.token;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const itemA = MenuItem.register({ name: "برجر-عروض-جست" });
    const variantA = itemA.addVariant({ label: "عادي", price: 60 });
    await menuItemRepo.save(itemA);
    variantAId = variantA.id;

    const itemB = MenuItem.register({ name: "بيبسي-عروض-جست" });
    const variantB = itemB.addVariant({ label: "وسط", price: 15 });
    await menuItemRepo.save(itemB);
    variantBId = variantB.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM combo_items`.execute(db);
    await sql`DELETE FROM combos WHERE name LIKE '%عروض-جست%'`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id IN (${variantAId}, ${variantBId})`.execute(db);
    await sql`DELETE FROM menu_items WHERE name LIKE '%عروض-جست%'`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-combos@jest.test'`.execute(db);
    await app.close();
  });

  let comboId: string;

  test("POST /catalog/combos بيسجّل عرض جديد ببندين", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "عرض برجر+بيبسي-عروض-جست",
        price: 65,
        items: [
          { variantId: variantAId, quantity: 1 },
          { variantId: variantBId, quantity: 1 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(65);
    expect(res.body.isActive).toBe(true);
    expect(res.body.items).toHaveLength(2);
    comboId = res.body.id;
  });

  test("POST /catalog/combos بنفس الاسم -> 409 (تكرار)", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "عرض برجر+بيبسي-عروض-جست", price: 70, items: [{ variantId: variantAId, quantity: 1 }] });
    expect(res.status).toBe(409);
  });

  test("POST /catalog/combos ببند بيشاور على حجم مش موجود -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "عرض غلط-عروض-جست", price: 50, items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("GET /catalog/combos بيرجّع العروض النشطة بس", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/combos").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { id: string }) => c.id === comboId)).toBe(true);
  });

  test("PATCH /catalog/combos/:id بيعطّل العرض، فمبيظهرش في القايمة النشطة بس يفضل في /all", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/catalog/combos/${comboId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const activeList = await request(app.getHttpServer()).get("/catalog/combos").set("Authorization", `Bearer ${adminToken}`);
    expect(activeList.body.some((c: { id: string }) => c.id === comboId)).toBe(false);

    const allList = await request(app.getHttpServer()).get("/catalog/combos/all").set("Authorization", `Bearer ${adminToken}`);
    expect(allList.body.some((c: { id: string }) => c.id === comboId)).toBe(true);

    // نرجّعه نشط تاني عشان تيست الطلبات (orders-combos.e2e.spec.ts) لو استخدمه
    await request(app.getHttpServer()).patch(`/catalog/combos/${comboId}`).set("Authorization", `Bearer ${adminToken}`).send({ isActive: true });
  });

  test("PUT /catalog/combos/:id/items بيستبدل بنود العرض بالكامل", async () => {
    const res = await request(app.getHttpServer())
      .put(`/catalog/combos/${comboId}/items`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ items: [{ variantId: variantAId, quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2);
  });
});
