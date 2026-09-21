import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e حقيقي: PATCH /pos-settings بيغيّر قيمة فعلية بيستهلكها context تاني (Shifts) - مش بس CRUD على
// جدول منفصل، ده هو أصل مشكلة TIER3-5 (قيم كانت متثبّتة في الكود، دلوقتي قابلة للتهيئة فعليًا)
describe("POS Settings - إعدادات النظام القابلة للتهيئة", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let branchId: string;

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
      name: "أدمن-إعدادات-جست", email: "admin-pos-settings@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-pos-settings@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع إعدادات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const cashier = User.register({
      name: "كاشير-إعدادات-جست", email: "cashier-pos-settings@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
      branchId,
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-pos-settings@jest.test", password: "12345678" })
    ).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM cashier_shifts WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    // نرجّع الإعدادات لقيمها الافتراضية (ونشيل updated_by) قبل مسح المستخدمين - وإلا فشل بسبب FK
    await sql`UPDATE pos_settings SET shift_variance_ack_threshold_egp = 20, updated_by = NULL WHERE id = 1`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-pos-settings@jest.test', 'cashier-pos-settings@jest.test')`.execute(db);
    await app.close();
  });

  test("GET /pos-settings بيرجّع القيم الافتراضية أول مرة (نفس القيم اللي كانت متثبّتة في الكود)", async () => {
    const res = await request(app.getHttpServer()).get("/pos-settings").set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shiftVarianceAckThresholdEgp).toBe(20);
    expect(res.body.driverSettlementVarianceAckThresholdEgp).toBe(30);
    expect(res.body.driverHourlyRateEgp).toBe(33);
    expect(res.body.paymentAdjustmentHighThresholdEgp).toBe(500);
    expect(res.body.productionVarianceAlertPercent).toBe(10);
  });

  test("PATCH /pos-settings بكاشير (مفيش pos_settings.manage) -> 403", async () => {
    const res = await request(app.getHttpServer())
      .patch("/pos-settings")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ shiftVarianceAckThresholdEgp: 0 });
    expect(res.status).toBe(403);
  });

  test("PATCH /pos-settings بأدمن بيغيّر القيمة فعليًا وبيأثر على سلوك قفل الشيفت", async () => {
    const updateRes = await request(app.getHttpServer())
      .patch("/pos-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ shiftVarianceAckThresholdEgp: 0 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.shiftVarianceAckThresholdEgp).toBe(0);
    expect(updateRes.body.updatedBy).toBeTruthy();

    // فرق 5ج كان قبل كده جوّه حد الاعتماد الافتراضي (20ج) فيتقفل تلقائيًا - دلوقتي الحد بقى صفر،
    // فأي فرق (حتى 5ج) لازم يوقّف الشيفت PENDING_REVIEW
    const openRes = await request(app.getHttpServer())
      .post("/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ openingCash: 100 });
    expect(openRes.status).toBe(201);

    const closeRes = await request(app.getHttpServer())
      .post(`/shifts/${openRes.body.id}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ actualCash: 105 });
    expect(closeRes.status).toBe(201);
    expect(closeRes.body.cashVariance).toBe(5);
    expect(closeRes.body.status).toBe("PENDING_REVIEW");
    expect(closeRes.body.varianceStatus).toBe("PENDING_REVIEW");
  });
});
