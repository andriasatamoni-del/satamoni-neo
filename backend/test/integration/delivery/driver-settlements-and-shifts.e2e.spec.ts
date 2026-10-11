import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, inArray } from "drizzle-orm";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { deliveryAssignments, driverAttendanceShifts, driverSettlements, drivers } from "../../../src/contexts/delivery/infrastructure/persistence/delivery.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { truncate } from "../helpers/db";
import type { Database } from "../../../src/shared/database/database.token";

describe("Delivery - تسويات كاش السائقين وشيفتات الحضور (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let cashPaymentMethodId: string;
  let driverId: string;

  async function createDeliveredCashAssignment(collectedAmount?: number) {
    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", items: [{ variantId, quantity: 1 }], paymentMethodId: cashPaymentMethodId });
    const orderId = orderRes.body.id;

    const assignRes = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId });
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
    const { AccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تسويات-سائقين-جست", email: "admin-driver-settlements@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-driver-settlements@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع تسويات-سائقين-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "برجر-تسويات-سائقين-جست" });
    const variant = item.addVariant({ label: "وسط", price: 100 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const accountRepo = new AccountRepository(app.get<Database>(DATABASE));
    const cashAccount = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    const varianceAccount = Account.register({ code: "6950", name: "فروق كاش", accountType: "EXPENSE", isSystemAccount: true });
    const otherExpenseAccount = Account.register({ code: "6900", name: "مصروفات تشغيل أخرى", accountType: "EXPENSE", isSystemAccount: true });
    await accountRepo.save(cashAccount);
    await accountRepo.save(varianceAccount);
    await accountRepo.save(otherExpenseAccount);

    const pmRes = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "كاش-تسويات-سائقين-جست", kind: "cash" });
    cashPaymentMethodId = pmRes.body.id;

    const driverRes = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-تسويات-جست", branchId });
    driverId = driverRes.body.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(driverAttendanceShifts);
    await db.update(deliveryAssignments).set({ settlement_id: null }).where(eq(deliveryAssignments.branch_id, branchId));
    await db.delete(driverSettlements).where(eq(driverSettlements.branch_id, branchId));
    await db.delete(deliveryAssignments).where(eq(deliveryAssignments.branch_id, branchId));
    await db.delete(drivers).where(eq(drivers.id, driverId));
    await db.delete(orderItems);
    await db.delete(payments).where(inArray(payments.order_id, db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await db.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(paymentMethods).where(eq(paymentMethods.id, cashPaymentMethodId));
    await db.delete(menuItemVariants);
    await db.delete(menuItems);
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(accounts).where(inArray(accounts.code, ["1100", "6950", "6900"]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-driver-settlements@jest.test"));
    await app.close();
  });

  test("تسوية كاش من غير طلبات مسلَّمة -> 400 (مفيش حاجة تتسوى)", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 0 });
    expect(res.status).toBe(400);
  });

  test("تسوية كاش سائق: فرق داخل حد الاعتماد (30ج) -> NONE، من غير قيد محاسبي", async () => {
    await createDeliveredCashAssignment(100); // قيمة الطلب 100، السائق قال إنه حصّل 100
    const res = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 100 }); // سلّم بالظبط زي ما حصّل
    expect(res.status).toBe(201);
    expect(res.body.orderCount).toBe(1);
    expect(res.body.codCollected).toBe(100);
    expect(res.body.expectedHandover).toBe(100);
    expect(res.body.handoverVariance).toBe(0);
    expect(res.body.varianceStatus).toBe("NONE");
  });

  test("تسوية كاش سائق: فرق أكبر من حد الاعتماد -> PENDING_REVIEW ويترحّل قيد فرق", async () => {
    await createDeliveredCashAssignment(100);
    const cashBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 50 }); // سلّم 50 بس من أصل 100 - عجز 50 (أكبر من حد 30ج)
    expect(res.status).toBe(201);
    expect(res.body.handoverVariance).toBe(-50);
    expect(res.body.varianceStatus).toBe("PENDING_REVIEW");
    const settlementId = res.body.id;

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(cashBefore + 1); // قيد فرق واحد جديد اترحّل

    // نفس الطلب المسلَّم اتحسب في تسوية بالفعل - محاولة تسوية تانية من غير طلبات جديدة تفشل
    const nothingLeft = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 0 });
    expect(nothingLeft.status).toBe(400);

    // مراجعة الفرق - اعتماد
    const reviewed = await request(app.getHttpServer())
      .post(`/delivery/settlements/${settlementId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve", notes: "اتراجع مع السائق" });
    expect(reviewed.status).toBe(201);
    expect(reviewed.body.varianceStatus).toBe("APPROVED");

    // مراجعة تانية على نفس التسوية بعد ما خلصت -> 400
    const reviewAgain = await request(app.getHttpServer())
      .post(`/delivery/settlements/${settlementId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });
    expect(reviewAgain.status).toBe(409);
  });

  test("شيفت حضور السائق: دخول -> دخول تاني وهو لسه شغال (409) -> خروج بيحسب الأجر ويرحّل قيد مصروف", async () => {
    const checkIn = await request(app.getHttpServer())
      .post("/delivery/attendance-shifts/check-in")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.status).toBe("ACTIVE");
    const shiftId = checkIn.body.id;

    const checkInAgain = await request(app.getHttpServer())
      .post("/delivery/attendance-shifts/check-in")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId });
    expect(checkInAgain.status).toBe(409);

    // طلب بيتسلّم أثناء الشيفت نفسه - عشان البونص يتحسب (بونص = عدد الطلبات المُسلَّمة من checked_in_at
    // لحد دلوقتي، مش الطلبات القديمة من قبل الدخول)
    await createDeliveredCashAssignment(100);

    const cashBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const checkOut = await request(app.getHttpServer())
      .post(`/delivery/attendance-shifts/${shiftId}/check-out`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "شيفت عادي" });
    expect(checkOut.status).toBe(201);
    expect(checkOut.body.status).toBe("CLOSED");
    expect(checkOut.body.hourlyRate).toBe(33);
    expect(checkOut.body.hoursWorked).toBeGreaterThanOrEqual(0);
    expect(checkOut.body.totalPay).toBeGreaterThan(0); // wageAmount (ممكن يكون قريب من صفر) + bonusTotal (2 طلبات اتسلّموا فعلًا)

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(cashBefore + 1); // قيد أجر واحد جديد اترحّل

    // نفس الشيفت المقفول - دخول جديد لازم ينجح (مفيش شيفت ACTIVE تاني)
    const checkInAfterClose = await request(app.getHttpServer())
      .post("/delivery/attendance-shifts/check-in")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId });
    expect(checkInAfterClose.status).toBe(201);
    // ننضّف الشيفت الجديد ده فورًا عشان مايأثرش على afterAll لو اتنفّذ بعد كده
    await request(app.getHttpServer())
      .post(`/delivery/attendance-shifts/${checkInAfterClose.body.id}/check-out`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    // الطلب اللي اتسلّم أثناء الشيفت لسه مش متسوّى - نسوّيه هنا عشان مايفضلش يتراكم على الاختبارات
    // اللي جايّة (بيأثر على حساب الفرق لأي تسوية تانية لنفس السائق)
    await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId, branchId, actualHandover: 100 });
  });

  test("كاشير معندوش delivery.settlements.review -> 403 على مراجعة التسوية", async () => {
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
      name: "كاشير-تسويات-سائقين-جست", email: "cashier-driver-settlements@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier", branchId, // Phase 3.1: cashier is branch-bound
    });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-driver-settlements@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .post("/delivery/settlements/00000000-0000-0000-0000-000000000000/review")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send({ decision: "approve" });
    expect(res.status).toBe(403);

    // بالمقابل - كاشير مسموحله يعمل تسوية (delivery.settlements.create)
    await createDeliveredCashAssignment(100);
    const createRes = await request(app.getHttpServer())
      .post("/delivery/settlements")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send({ driverId, branchId, actualHandover: 100 });
    expect(createRes.status).toBe(201);

    await db.update(driverSettlements).set({ settled_by: null }).where(inArray(driverSettlements.settled_by, db.select({ id: users.id }).from(users).where(eq(users.email, "cashier-driver-settlements@jest.test"))));
    await db.delete(users).where(eq(users.email, "cashier-driver-settlements@jest.test"));
  });
});
