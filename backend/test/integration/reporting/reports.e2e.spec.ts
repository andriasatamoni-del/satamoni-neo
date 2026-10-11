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
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

describe("Reporting - GET /reports/dashboard (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let branchManagerToken: string;
  let variantId: string;
  let paymentMethodId: string;
  const today = new Date().toISOString().slice(0, 10);

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
      name: "أدمن-تقارير-جست", email: "admin-reports@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const adminLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-reports@jest.test", password: "12345678" });
    adminToken = adminLogin.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع تقارير-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const branchManager = User.register({
      name: "مدير فرع-تقارير-جست", email: "manager-reports@jest.test", passwordHash: await hasher.hash("12345678"),
      role: "branch_manager", branchId,
    });
    await userRepo.save(branchManager);
    const managerLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "manager-reports@jest.test", password: "12345678" });
    branchManagerToken = managerLogin.body.token;

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "صنف-تقارير-جست" });
    const variant = item.addVariant({ label: "عادي", price: 100 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const methodRes = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "كاش-تقارير-جست", kind: "cash" });
    paymentMethodId = methodRes.body.id;

    // طلب واحد فعّال بقيمة 200 (2 × 100) مربوط بدفعة كاش، وطلب تاني هيتلغي بعد كده
    await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 2 }], paymentMethodId });

    const toCancel = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });
    await request(app.getHttpServer())
      .patch(`/orders/${toCancel.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(payments).where(eq(payments.branch_id, branchId));
    await db.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await db.delete(orderItems).where(inArray(orderItems.order_id, db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(paymentMethods).where(eq(paymentMethods.id, paymentMethodId));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.id, variantId));
    await db.delete(menuItems).where(eq(menuItems.name, "صنف-تقارير-جست"));
    await db.delete(users).where(inArray(users.email, ["admin-reports@jest.test", "manager-reports@jest.test"]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await app.close();
  });

  test("بتوكن أدمن + فلتر فرع وتاريخ اليوم - بيرجّع ملخص صحيح (إيراد الطلب الملغي مش محسوب)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/dashboard?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(200);
    expect(res.body.orderCount).toBe(1);
    expect(res.body.cancelledCount).toBe(1);
    expect(res.body.avgOrderValue).toBe(200);
    expect(res.body.dailyTrend).toEqual([{ date: today, revenue: 200 }]);
    expect(res.body.topItemsByRevenue[0]).toMatchObject({ name: "صنف-تقارير-جست", quantity: 2, revenue: 200 });
    expect(res.body.revenueByBranch[0]).toMatchObject({ branchId, revenue: 200, orderCount: 1 });
    expect(res.body.paymentMethodBreakdown[0]).toMatchObject({ paymentMethodId, amount: 200 });
    const statuses = Object.fromEntries(res.body.orderStatusBreakdown.map((s: { status: string; count: number }) => [s.status, s.count]));
    expect(statuses.preparing).toBe(1);
    expect(statuses.cancelled).toBe(1);
  });

  test("بدون from/to - بيرجع بنجاح بفترة افتراضية (آخر 30 يوم)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/dashboard?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBeGreaterThanOrEqual(200);
  });

  test("مدير الفرع مقفول على فرعه: branchId لفرع تاني -> 403 (Phase 3.1 / BL-11)، وبدون branchId بيتثبّت على فرعه", async () => {
    const foreign = await request(app.getHttpServer())
      .get(`/reports/dashboard?branchId=00000000-0000-0000-0000-000000000000&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${branchManagerToken}`);
    expect(foreign.status).toBe(403);
    expect(foreign.body.revenue).toBeUndefined();

    const own = await request(app.getHttpServer())
      .get(`/reports/dashboard?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${branchManagerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.revenue).toBe(200); // نفس نتيجة فرعه هو، مش صفر
  });

  test("كاشير معندوش reports.view -> 403", async () => {
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
      name: "كاشير-تقارير-جست", email: "cashier-reports@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-reports@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .get("/reports/dashboard")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);

    await db.delete(users).where(eq(users.email, "cashier-reports@jest.test"));
  });
});
