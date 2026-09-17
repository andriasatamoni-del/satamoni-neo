import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Treasury - /treasuries و /banks (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let mainTreasuryId: string;
  let bankId: string;
  let bankTreasuryId: string;
  let bankAccountId: string;

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
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-خزائن-جست", email: "admin-treasury@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-treasury@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    if (bankAccountId) await sql`DELETE FROM bank_accounts WHERE id = ${bankAccountId}`.execute(db);
    if (bankId) await sql`DELETE FROM banks WHERE id = ${bankId}`.execute(db);
    // قيود POSTED مش قابلة للحذف بـDELETE عادي (trigger المناعة) - TRUNCATE بس بيتخطى الـtriggers
    // دي، نفس اتفاقية باقي تستات المحاسبة بالظبط (order-sale-posting/payroll-approval-posting)
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId} OR branch_id IS NULL`.execute(db);
    if (bankTreasuryId) await sql`DELETE FROM accounts WHERE code LIKE 'BANK-%'`.execute(db);
    await sql`DELETE FROM accounts WHERE code LIKE 'TRSY-%'`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-treasury@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /branches بيعمل خزينة رئيسية MAIN تلقائيًا للفرع الجديد", async () => {
    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع خزائن-جست" });
    expect(branchRes.status).toBe(201);
    branchId = branchRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/treasuries?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kind).toBe("MAIN");
    expect(res.body[0].balance).toBe(0);
    mainTreasuryId = res.body[0].id;
  });

  test("POST /treasuries تاني على نفس الفرع بـkind MAIN -> 400 (خزينة رئيسية واحدة بس)", async () => {
    const res = await request(app.getHttpServer())
      .post("/treasuries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "خزينة تكرار", branchId });
    expect(res.status).toBe(400);
  });

  test("POST /banks و /banks/accounts - بيعمل خزينة بنك (BANK) برصيد صفر", async () => {
    const bankRes = await request(app.getHttpServer())
      .post("/banks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بنك تجريبي-جست" });
    expect(bankRes.status).toBe(201);
    bankId = bankRes.body.id;

    const accountRes = await request(app.getHttpServer())
      .post("/banks/accounts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bankId, name: "حساب تجريبي-جست", accountNumber: "123456", iban: "EG000000000000000000" });
    expect(accountRes.status).toBe(201);
    bankAccountId = accountRes.body.id;
    bankTreasuryId = accountRes.body.treasuryId;

    const listRes = await request(app.getHttpServer())
      .get("/banks/accounts")
      .set("Authorization", `Bearer ${adminToken}`);
    const created = listRes.body.find((b: { id: string }) => b.id === bankAccountId);
    expect(created).toMatchObject({ bankName: "بنك تجريبي-جست", accountNumber: "123456", balance: 0 });
  });

  test("POST /treasuries/:id/transfer - بيحوّل من الخزينة الرئيسية للبنك وبيحدّث الرصيدين", async () => {
    const res = await request(app.getHttpServer())
      .post(`/treasuries/${mainTreasuryId}/transfer`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ toTreasuryId: bankTreasuryId, amount: 500, notes: "إيداع بنكي" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("POSTED");

    const treasuriesRes = await request(app.getHttpServer())
      .get(`/treasuries?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const main = treasuriesRes.body.find((t: { id: string }) => t.id === mainTreasuryId);
    const bank = treasuriesRes.body.find((t: { id: string }) => t.id === bankTreasuryId);
    expect(main.balance).toBe(-500);
    expect(bank.balance).toBe(500);
  });

  test("تحويل خزينة لنفسها -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/treasuries/${mainTreasuryId}/transfer`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ toTreasuryId: mainTreasuryId, amount: 100 });
    expect(res.status).toBe(400);
  });

  test("تحويل بمبلغ صفر أو سالب -> 400 (validation)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/treasuries/${mainTreasuryId}/transfer`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ toTreasuryId: bankTreasuryId, amount: 0 });
    expect(res.status).toBe(400);
  });

  test("مدير الفرع مقفول على فرعه، وكاشير معندوش treasuries.view -> 403", async () => {
    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();

    const manager = User.register({
      name: "مدير فرع-خزائن-جست", email: "manager-treasury@jest.test", passwordHash: await hasher.hash("12345678"),
      role: "branch_manager", branchId,
    });
    await userRepo.save(manager);
    const managerLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "manager-treasury@jest.test", password: "12345678" });
    const managerRes = await request(app.getHttpServer())
      .get("/treasuries")
      .set("Authorization", `Bearer ${managerLogin.body.token}`);
    expect(managerRes.status).toBe(200);
    expect(managerRes.body.some((t: { id: string }) => t.id === mainTreasuryId)).toBe(true);

    const managerTransfer = await request(app.getHttpServer())
      .post(`/treasuries/${mainTreasuryId}/transfer`)
      .set("Authorization", `Bearer ${managerLogin.body.token}`)
      .send({ toTreasuryId: bankTreasuryId, amount: 10 });
    expect(managerTransfer.status).toBe(403); // مالي بحت، مش متاح لمدير الفرع

    const cashier = User.register({
      name: "كاشير-خزائن-جست", email: "cashier-treasury@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    const cashierLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-treasury@jest.test", password: "12345678" });
    const cashierRes = await request(app.getHttpServer())
      .get("/treasuries")
      .set("Authorization", `Bearer ${cashierLogin.body.token}`);
    expect(cashierRes.status).toBe(403);

    await sql`DELETE FROM users WHERE email IN ('manager-treasury@jest.test', 'cashier-treasury@jest.test')`.execute(db);
  });
});
