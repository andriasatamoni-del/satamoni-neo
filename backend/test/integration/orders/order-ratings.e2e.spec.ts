import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orderRatings, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

describe("تقييم الطلب - صفحة عامة بدون تسجيل دخول (TIER3-3، راجع routes/order-ratings.js في الريبو القديم)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;

  async function createOrder() {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function ratingTokenOf(orderId: string): Promise<string> {
    const db = app.get<Database>(DATABASE);
    const [row] = await db.select({ rating_token: orders.rating_token }).from(orders).where(eq(orders.id, orderId));
    return row.rating_token;
  }

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
    const { MenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تقييمات", email: "admin-ratings@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-ratings@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-تقييمات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "صنف-تقييمات-جست" });
    const variant = item.addVariant({ label: "عادي", price: 120 });
    await menuItemRepo.save(item);
    variantId = variant.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(orderRatings).where(eq(orderRatings.branch_id, branchId));
    await db.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await db.delete(orderItems).where(inArray(orderItems.order_id, db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.id, variantId));
    await db.delete(menuItems).where(eq(menuItems.name, "صنف-تقييمات-جست"));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-ratings@jest.test"));
    await app.close();
  });

  test("GET /order-ratings/:orderId بتوكن صحيح -> بيانات الطلب + الأصناف + مفيش تقييم سابق", async () => {
    const orderId = await createOrder();
    const token = await ratingTokenOf(orderId);

    const res = await request(app.getHttpServer()).get(`/order-ratings/${orderId}`).query({ token });
    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe(orderId);
    expect(res.body.branchName).toBe("فرع-تقييمات-جست");
    expect(res.body.items).toEqual([{ name: "صنف-تقييمات-جست", variant: "عادي", quantity: 1 }]);
    expect(res.body.existingRating).toBeNull();
  });

  test("GET بتوكن غلط -> 404", async () => {
    const orderId = await createOrder();
    const res = await request(app.getHttpServer())
      .get(`/order-ratings/${orderId}`)
      .query({ token: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  test("GET بتوكن طلب تاني مع رقم طلب مش بتاعه -> 404", async () => {
    const orderIdA = await createOrder();
    const orderIdB = await createOrder();
    const tokenB = await ratingTokenOf(orderIdB);

    const res = await request(app.getHttpServer()).get(`/order-ratings/${orderIdA}`).query({ token: tokenB });
    expect(res.status).toBe(404);
  });

  test("GET برقم طلب مش UUID صحيح -> 400", async () => {
    const res = await request(app.getHttpServer()).get("/order-ratings/not-a-uuid").query({ token: "x" });
    expect(res.status).toBe(400);
  });

  test("POST /order-ratings/:orderId بتقييم صحيح -> ok:true وصف واحد في order_ratings", async () => {
    const orderId = await createOrder();
    const token = await ratingTokenOf(orderId);

    const res = await request(app.getHttpServer()).post(`/order-ratings/${orderId}`).send({ token, stars: 5, comment: "ممتاز" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const check = await request(app.getHttpServer()).get(`/order-ratings/${orderId}`).query({ token });
    expect(check.body.existingRating).toEqual({ stars: 5, comment: "ممتاز" });
  });

  test("إعادة الإرسال بنفس اللينك بتحدّث نفس التقييم مش تنشئ واحد جديد", async () => {
    const orderId = await createOrder();
    const token = await ratingTokenOf(orderId);

    await request(app.getHttpServer()).post(`/order-ratings/${orderId}`).send({ token, stars: 2, comment: "معلش" });
    const res = await request(app.getHttpServer()).post(`/order-ratings/${orderId}`).send({ token, stars: 5, comment: "غيرت رأيي" });
    expect(res.status).toBe(200);

    const db = app.get<Database>(DATABASE);
    const rows = await db.select().from(orderRatings).where(eq(orderRatings.order_id, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
    expect(rows[0].comment).toBe("غيرت رأيي");
  });

  test("نجوم برة النطاق (0 أو 6) -> 400", async () => {
    const orderId = await createOrder();
    const token = await ratingTokenOf(orderId);

    let res = await request(app.getHttpServer()).post(`/order-ratings/${orderId}`).send({ token, stars: 0 });
    expect(res.status).toBe(400);
    res = await request(app.getHttpServer()).post(`/order-ratings/${orderId}`).send({ token, stars: 6 });
    expect(res.status).toBe(400);
  });

  test("POST بتوكن غلط -> 404 ومفيش تقييم اتسجّل", async () => {
    const orderId = await createOrder();
    const res = await request(app.getHttpServer())
      .post(`/order-ratings/${orderId}`)
      .send({ token: "00000000-0000-0000-0000-000000000000", stars: 4 });
    expect(res.status).toBe(404);

    const db = app.get<Database>(DATABASE);
    const rows = await db.select().from(orderRatings).where(eq(orderRatings.order_id, orderId));
    expect(rows).toHaveLength(0);
  });
});
