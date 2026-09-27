import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Reporting - تقارير التوصيل والعملاء والمصروفات والمشتريات (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let branchId: string;
  let variantId: string;
  let driverId: string;
  let assignmentAId: string;
  let assignmentBId: string;
  let orderAId: string;
  let orderBId: string;
  let categoryId: string;
  let expenseId: string;
  let purchaseId: string;
  const customerPhone = "01011112222-جست";
  const today = new Date().toISOString().slice(0, 10);

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
    const { KyselyMenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { KyselyAccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const accountRepo = new KyselyAccountRepository(db);
    const cashAccount = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    const expenseAccount = Account.register({ code: "6900", name: "مصروفات تشغيل أخرى", accountType: "EXPENSE", isSystemAccount: true });
    await accountRepo.save(cashAccount);
    await accountRepo.save(expenseAccount);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تقارير-توصيل-جست", email: "admin-delcustreports@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-delcustreports@jest.test", password: "12345678" })).body.token;

    const cashier = User.register({
      name: "كاشير-تقارير-توصيل-جست", email: "cashier-delcustreports@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-delcustreports@jest.test", password: "12345678" })).body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع-تقارير-توصيل-جست" });
    branchId = branchRes.body.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف-تقارير-توصيل-جست" });
    const variant = item.addVariant({ label: "عادي", price: 100 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const driverRes = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-تقارير-توصيل-جست", branchId });
    driverId = driverRes.body.id;

    // أوردر دليفري 1 - هيوصل بنجاح (DELIVERED)
    const orderARes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", customerName: "عميل-جست", customerPhone, items: [{ variantId, quantity: 1 }] });
    orderAId = orderARes.body.id;
    for (const status of ["ACCEPTED", "PREPARING", "READY"]) {
      await request(app.getHttpServer())
        .patch(`/orders/${orderAId}/kitchen-status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ kitchenStatus: status });
    }
    const assignARes = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId: orderAId, driverId });
    assignmentAId = assignARes.body.id;
    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentAId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERED", collectedAmount: 100 });

    // أوردر دليفري 2 - نفس العميل، هيفشل توصيله (FAILED)
    const orderBRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", customerName: "عميل-جست", customerPhone, items: [{ variantId, quantity: 1 }] });
    orderBId = orderBRes.body.id;
    const assignBRes = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId: orderBId, driverId });
    assignmentBId = assignBRes.body.id;
    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentBId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "FAILED", failureReason: "العميل مردّش" });

    // فئة مصروف بحد تنبيه 50 + مصروف بقيمة 100 (أعلى من الحد - عشان anomalies)
    const categoryRes = await request(app.getHttpServer())
      .post("/expenses/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فئة-تقارير-توصيل-جست", alertThreshold: 50 });
    categoryId = categoryRes.body.id;
    const expenseRes = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: today, categoryId, amount: 100 });
    expenseId = expenseRes.body.id;
    expect(expenseRes.body.status).toBe("POSTED");

    // مشترى نقدي بفئة "صيانة" بقيمة 300 - هيتأكد عشان يتحسب في التقرير
    const purchaseRes = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: today, category: "صيانة-جست", amount: 300 });
    purchaseId = purchaseRes.body.id;
    await request(app.getHttpServer())
      .post(`/purchases/${purchaseId}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM purchases WHERE id = ${purchaseId}`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM expenses WHERE id = ${expenseId}`.execute(db);
    await sql`DELETE FROM expense_categories WHERE id = ${categoryId}`.execute(db);
    await sql`DELETE FROM accounts WHERE code IN ('1100', '6900')`.execute(db);
    await sql`DELETE FROM delivery_assignments WHERE id IN (${assignmentAId}, ${assignmentBId})`.execute(db);
    await sql`DELETE FROM drivers WHERE id = ${driverId}`.execute(db);
    await sql`DELETE FROM print_jobs WHERE order_id IN (${orderAId}, ${orderBId})`.execute(db);
    await sql`DELETE FROM order_items WHERE order_id IN (${orderAId}, ${orderBId})`.execute(db);
    await sql`DELETE FROM payments WHERE order_id IN (${orderAId}, ${orderBId})`.execute(db);
    await sql`DELETE FROM orders WHERE id IN (${orderAId}, ${orderBId})`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id = ${variantId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'صنف-تقارير-توصيل-جست'`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-delcustreports@jest.test', 'cashier-delcustreports@jest.test')`.execute(db);
    await app.close();
  });

  test("GET /reports/drivers - أداء السائق: اتسلّم/فشل/الإيراد", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/drivers?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { driverId: string }) => r.driverId === driverId);
    expect(row.ordersCount).toBe(1);
    expect(row.revenue).toBe(100);
    expect(row.failedCount).toBe(1);
    expect(row.avgDeliveryMinutes).not.toBeNull();
  });

  test("GET /reports/delivery-service - مؤشرات خدمة الدليفري الإجمالية", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/delivery-service?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(2);
    expect(res.body.failedCount).toBe(1);
    expect(res.body.failureRate).toBeCloseTo(0.5);
    expect(res.body.avgPrepMinutes).not.toBeNull();
    expect(res.body.avgDeliveryMinutes).not.toBeNull();
  });

  test("GET /reports/peak-hours - عدد الطلبات موزّع على الساعات وأيام الأسبوع", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/peak-hours?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const totalFromHours = res.body.byHour.reduce((s: number, r: { ordersCount: number }) => s + r.ordersCount, 0);
    expect(totalFromHours).toBe(2);
    const totalFromDow = res.body.byDayOfWeek.reduce((s: number, r: { ordersCount: number }) => s + r.ordersCount, 0);
    expect(totalFromDow).toBe(2);
  });

  test("GET /reports/customer-spend - أعلى العملاء إنفاقًا", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/customer-spend?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.topCustomers.find((r: { phone: string }) => r.phone === customerPhone);
    expect(row.ordersCount).toBe(2);
    expect(row.totalSpent).toBe(200);
    expect(row.name).toBe("عميل-جست");
  });

  test("GET /reports/expenses-report - مجمّع حسب الفئة + تنبيهات تجاوز الحد", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/expenses-report?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const catRow = res.body.byCategory.find((r: { category: string }) => r.category === "فئة-تقارير-توصيل-جست");
    expect(catRow.total).toBe(100);
    const anomaly = res.body.anomalies.find((r: { id: string }) => r.id === expenseId);
    expect(anomaly).toBeDefined();
    expect(anomaly.amount).toBe(100);
    expect(anomaly.alertThreshold).toBe(50);
  });

  test("GET /reports/purchases-report - مجمّع حسب الفئة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/purchases-report?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const catRow = res.body.byCategory.find((r: { category: string }) => r.category === "صيانة-جست");
    expect(catRow.total).toBe(300);
  });

  test("كاشير (معندوش reports.view) -> drivers بيرجّع 403", async () => {
    const res = await request(app.getHttpServer())
      .get("/reports/drivers")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });
});
