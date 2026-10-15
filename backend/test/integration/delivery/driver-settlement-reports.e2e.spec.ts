import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { deliveryAssignments, driverSettlements, drivers } from "../../../src/contexts/delivery/infrastructure/persistence/delivery.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import type { Database } from "../../../src/shared/database/database.token";

// e2e لثلاث قراءات جديدة بتخدم سيناريو "تحصيل مجمع" عند الكاشير: معاينة تسوية سائق قبل تسجيلها،
// قايمة السائقين اللي عندهم كاش معلّق في الفرع، وتقرير كل أوردرات السائق المُسلَّمة في يوم معيّن
// (محصّلة ولسه معلّقة) - نفس مفهوم /preview و/pending-drivers و/driver-orders في الريبو القديم
describe("Delivery: معاينة تسوية السائق وتقرير أوردرات اليوم", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let cashPaymentMethodId: string;
  let driverId: string;
  let otherDriverId: string;

  async function createDeliveredCashAssignment(driverIdForOrder: string, collectedAmount?: number) {
    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", items: [{ variantId, quantity: 1 }], paymentMethodId: cashPaymentMethodId });
    const orderId = orderRes.body.id;

    const assignRes = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId: driverIdForOrder });
    const assignmentId = assignRes.body.id;

    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OUT_FOR_DELIVERY" });
    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERED", ...(collectedAmount !== undefined ? { collectedAmount } : {}) });

    return { orderId, assignmentId };
  }

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
    const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تقارير-سائقين-جست", email: "admin-driver-reports@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-driver-reports@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع تقارير-سائقين-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "بيتزا-تقارير-سائقين-جست" });
    const variant = item.addVariant({ label: "وسط", price: 80 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const pmRes = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "كاش-تقارير-سائقين-جست", kind: "cash" });
    cashPaymentMethodId = pmRes.body.id;

    const driverRes = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-تقارير-جست", branchId });
    driverId = driverRes.body.id;

    const otherDriverRes = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-تاني-تقارير-جست", branchId });
    otherDriverId = otherDriverRes.body.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.update(deliveryAssignments).set({ settlement_id: null }).where(eq(deliveryAssignments.branch_id, branchId));
    await db.delete(driverSettlements).where(eq(driverSettlements.branch_id, branchId));
    await db.delete(deliveryAssignments).where(eq(deliveryAssignments.branch_id, branchId));
    await db.delete(drivers).where(inArray(drivers.id, [driverId, otherDriverId]));
    await db.delete(orderItems);
    await db.delete(payments).where(inArray(payments.order_id, db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await db.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(paymentMethods).where(eq(paymentMethods.id, cashPaymentMethodId));
    await db.delete(menuItemVariants);
    await db.delete(menuItems);
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-driver-reports@jest.test"));
    await app.close();
  });

  test("preview: من غير طلبات مسلّمة بيرجّع صفر", async () => {
    const res = await request(app.getHttpServer())
      .get(`/delivery/settlements/preview?driverId=${otherDriverId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBe(0);
    expect(res.body.expectedHandover).toBe(0);
    expect(res.body.bonusTotal).toBe(0);
  });

  test("pending-drivers: مفيش سائقين لسه (مفيش طلبات مسلّمة)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/delivery/settlements/pending-drivers?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("preview + pending-drivers + driver-orders بعد تسليم طلبين للسائق", async () => {
    await createDeliveredCashAssignment(driverId, 80);
    await createDeliveredCashAssignment(driverId, 80);

    const preview = await request(app.getHttpServer())
      .get(`/delivery/settlements/preview?driverId=${driverId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.orderCount).toBe(2);
    expect(preview.body.codExpected).toBe(160);
    expect(preview.body.codCollected).toBe(160);
    expect(preview.body.expectedHandover).toBe(160);
    expect(preview.body.bonusTotal).toBe(10); // 5ج × 2 طلب

    const pending = await request(app.getHttpServer())
      .get(`/delivery/settlements/pending-drivers?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pending.status).toBe(200);
    const entry = pending.body.find((d: { driverId: string }) => d.driverId === driverId);
    expect(entry).toBeTruthy();
    expect(entry.pendingOrderCount).toBe(2);
    expect(entry.pendingCash).toBe(160);

    const dayReport = await request(app.getHttpServer())
      .get(`/delivery/driver-orders?driverId=${driverId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dayReport.status).toBe(200);
    expect(dayReport.body.orderCount).toBe(2);
    expect(dayReport.body.bonusTotal).toBe(10);
    expect(dayReport.body.pendingBonusTotal).toBe(10);
    expect(dayReport.body.collectedBonusTotal).toBe(0);
    expect(dayReport.body.cashPendingCount).toBe(2);
    expect(dayReport.body.cashCollectedCount).toBe(0);
    expect(dayReport.body.orders.every((o: { collected: boolean }) => o.collected === false)).toBe(true);

    // بعد التسوية - الأوردرات تبقى "محصّلة" في التقرير وتختفي من قايمة السائقين المعلّقين
    const settleRes = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 160 });
    expect(settleRes.status).toBe(201);

    const pendingAfter = await request(app.getHttpServer())
      .get(`/delivery/settlements/pending-drivers?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pendingAfter.body.find((d: { driverId: string }) => d.driverId === driverId)).toBeFalsy();

    const dayReportAfter = await request(app.getHttpServer())
      .get(`/delivery/driver-orders?driverId=${driverId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dayReportAfter.body.collectedBonusTotal).toBe(10);
    expect(dayReportAfter.body.pendingBonusTotal).toBe(0);
    expect(dayReportAfter.body.cashCollectedCount).toBe(2);
  });

  test("preview لسائق مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .get(`/delivery/settlements/preview?driverId=00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
