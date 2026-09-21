import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("نظام الطباعة (TIER3-4) - طابعات + محطات تحضير + توجيه + طابور طباعة", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let categoryId: string;
  let variantId: string;

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
    const { KyselyMenuCategoryRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-category.repository");
    const { MenuCategory } = await import("../../../src/contexts/catalog/domain/menu-category.aggregate");
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-طباعة", email: "admin-printing@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-printing@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-طباعة-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const categoryRepo = new KyselyMenuCategoryRepository(db);
    const category = MenuCategory.register({ name: "قسم-طباعة-جست" });
    await categoryRepo.save(category);
    categoryId = category.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف-طباعة-جست", categoryId });
    const variant = item.addVariant({ label: "عادي", price: 90 });
    await menuItemRepo.save(item);
    variantId = variant.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM print_jobs WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM kitchen_stations WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM printers WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id = ${variantId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE id IN (SELECT id FROM menu_items WHERE category_id = ${categoryId})`.execute(db);
    await sql`DELETE FROM menu_categories WHERE id = ${categoryId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-printing@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /printing/printers بيرفض طابعة USB من غير osPrinterName", async () => {
    const res = await request(app.getHttpServer())
      .post("/printing/printers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, name: "طابعة بلا اسم", printerType: "CASHIER" });
    expect(res.status).toBe(400);
  });

  let cashierPrinterId: string;
  let kitchenPrinterId: string;
  let stationId: string;

  test("تسجيل طابعة كاشير + طابعة مطبخ", async () => {
    const cashierRes = await request(app.getHttpServer())
      .post("/printing/printers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, name: "طابعة الكاشير", printerType: "CASHIER", osPrinterName: "XP-CASHIER" });
    expect(cashierRes.status).toBe(201);
    cashierPrinterId = cashierRes.body.id;

    const kitchenRes = await request(app.getHttpServer())
      .post("/printing/printers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, name: "طابعة المطبخ", printerType: "KITCHEN", osPrinterName: "XP-KITCHEN" });
    expect(kitchenRes.status).toBe(201);
    kitchenPrinterId = kitchenRes.body.id;
  });

  test("تسجيل محطة تحضير مربوطة بطابعة المطبخ + توجيه القسم عليها", async () => {
    const stationRes = await request(app.getHttpServer())
      .post("/printing/kitchen-stations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, name: "محطة-طباعة-جست", printerId: kitchenPrinterId });
    expect(stationRes.status).toBe(201);
    stationId = stationRes.body.id;

    const routeRes = await request(app.getHttpServer())
      .patch(`/printing/kitchen-stations/routing/menu-categories/${categoryId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ stationId });
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.stationId).toBe(stationId);
  });

  test("GET /printing/kitchen-stations/routing/menu بيوري القسم موجّه للمحطة", async () => {
    const res = await request(app.getHttpServer())
      .get("/printing/kitchen-stations/routing/menu")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const category = res.body.find((c: { categoryId: string }) => c.categoryId === categoryId);
    expect(category.categoryStationId).toBe(stationId);
  });

  let takeawayOrderId: string;

  test("POST /orders (تيك أواي) - بيولّد إيصال عميل + ملخص مطبخ + تذكرة محطة تلقائيًا (عن طريق OrderRegistered)", async () => {
    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    takeawayOrderId = orderRes.body.id;

    const jobsRes = await request(app.getHttpServer())
      .get(`/printing/print-jobs?branchId=${branchId}&orderId=${takeawayOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(jobsRes.status).toBe(200);
    const types = jobsRes.body.map((j: { printType: string }) => j.printType).sort();
    expect(types).toEqual(["CUSTOMER_RECEIPT", "KITCHEN_SUMMARY", "KITCHEN_TICKET"]);
    for (const job of jobsRes.body) {
      expect(job.status).toBe("PENDING");
      expect(job.printerId).not.toBeNull();
    }
  });

  test("طابور الطباعة: claim -> printed دورة حياة كاملة", async () => {
    const jobsRes = await request(app.getHttpServer())
      .get(`/printing/print-jobs?branchId=${branchId}&orderId=${takeawayOrderId}&status=PENDING`)
      .set("Authorization", `Bearer ${adminToken}`);
    const jobId = jobsRes.body[0].id;

    const claimRes = await request(app.getHttpServer()).post(`/printing/print-jobs/${jobId}/claim`).set("Authorization", `Bearer ${adminToken}`);
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.status).toBe("PRINTING");

    const claimAgainRes = await request(app.getHttpServer()).post(`/printing/print-jobs/${jobId}/claim`).set("Authorization", `Bearer ${adminToken}`);
    expect(claimAgainRes.status).toBe(409);

    const printedRes = await request(app.getHttpServer()).post(`/printing/print-jobs/${jobId}/printed`).set("Authorization", `Bearer ${adminToken}`);
    expect(printedRes.status).toBe(201);
    expect(printedRes.body.status).toBe("PRINTED");
  });

  test("طابور الطباعة: claim -> failed -> retry", async () => {
    const jobsRes = await request(app.getHttpServer())
      .get(`/printing/print-jobs?branchId=${branchId}&orderId=${takeawayOrderId}&status=PENDING`)
      .set("Authorization", `Bearer ${adminToken}`);
    const jobId = jobsRes.body[0].id;

    await request(app.getHttpServer()).post(`/printing/print-jobs/${jobId}/claim`).set("Authorization", `Bearer ${adminToken}`);
    const failedRes = await request(app.getHttpServer())
      .post(`/printing/print-jobs/${jobId}/failed`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ error: "الورق خلص" });
    expect(failedRes.status).toBe(201);
    expect(failedRes.body.status).toBe("FAILED");
    expect(failedRes.body.lastError).toBe("الورق خلص");

    const retryRes = await request(app.getHttpServer()).post(`/printing/print-jobs/${jobId}/retry`).set("Authorization", `Bearer ${adminToken}`);
    expect(retryRes.status).toBe(201);
    expect(retryRes.body.status).toBe("PENDING");
    expect(retryRes.body.lastError).toBeNull();
  });

  test("POST /printing/printers/:id/test-print - بيتكرر بحرية من غير idempotency تعارض", async () => {
    const first = await request(app.getHttpServer())
      .post(`/printing/printers/${cashierPrinterId}/test-print`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post(`/printing/printers/${cashierPrinterId}/test-print`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  test("صالة: مفيش طباعة عند التسجيل، تذكرة مطبخ بس لما التحضير يوصل PREPARING", async () => {
    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "dinein", tableNumber: "T-طباعة-1", items: [{ variantId, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const dineinOrderId = orderRes.body.id;

    const beforeJobs = await request(app.getHttpServer())
      .get(`/printing/print-jobs?branchId=${branchId}&orderId=${dineinOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(beforeJobs.body).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/orders/${dineinOrderId}/kitchen-status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ kitchenStatus: "ACCEPTED" });
    await request(app.getHttpServer())
      .patch(`/orders/${dineinOrderId}/kitchen-status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ kitchenStatus: "PREPARING" });

    const afterJobs = await request(app.getHttpServer())
      .get(`/printing/print-jobs?branchId=${branchId}&orderId=${dineinOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(afterJobs.body).toHaveLength(1);
    expect(afterJobs.body[0].printType).toBe("KITCHEN_TICKET");

    const billRes = await request(app.getHttpServer())
      .post(`/printing/print-jobs/dine-in-bill/${dineinOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(billRes.status).toBe(201);
    expect(billRes.body.printType).toBe("DINE_IN_BILL");

    // إعادة الطلب لنفس الـendpoint بترجع نفس صف الفاتورة (idempotency_key ثابت لكل طلب)
    const billAgainRes = await request(app.getHttpServer())
      .post(`/printing/print-jobs/dine-in-bill/${dineinOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(billAgainRes.body.id).toBe(billRes.body.id);
  });
});
