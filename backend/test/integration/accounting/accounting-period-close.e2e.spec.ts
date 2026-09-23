import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لإقفال الشهر المحاسبي والسنة المالية - راجع تعليق migration 035 وCloseFiscalYearHandler لفلسفة
// القواعد (قفل شهر يمنع أي قيد جديد عليه، قفل سنة يتطلب كل شهورها CLOSED الأول وبيصفّر حسابات
// الإيرادات/تكلفة المبيعات/المصروفات على الأرباح المرحّلة بقيد واحد بتاريخ أول يناير السنة الجاية).
// سنة 2021 مُختارة عمدًا (مش مستخدمة في أي ملف اختبار تاني) عشان قفل شهورها ميأثرش على قيود ملفات
// اختبار تانية بتشارك نفس قاعدة الاختبار
describe("Accounting Period/Fiscal Year Close - إقفال الشهر والسنة المالية", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashId: string;
  let salesId: string;
  let expenseId: string;
  let retainedEarningsId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-إقفال-محاسبي-جست", email: "admin-period-close@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-period-close@jest.test", password: "12345678" })
    ).body.token;

    async function createAccount(code: string, name: string, accountType: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post("/accounting/accounts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code, name, accountType });
      return res.body.id;
    }
    cashId = await createAccount("1901-إقفال-جست", "الكاش-إقفال-جست", "ASSET");
    salesId = await createAccount("4901-إقفال-جست", "مبيعات-إقفال-جست", "REVENUE");
    expenseId = await createAccount("6901-إقفال-جست", "مصروفات-إقفال-جست", "EXPENSE");
    retainedEarningsId = await createAccount("3200", "أرباح مرحّلة", "EQUITY");

    // بيع 1000 + مصروف 300 في يناير 2021 - صافي الربح المتوقع بعد الإقفال = 700
    await request(app.getHttpServer())
      .post("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryDate: "2021-01-10", sourceType: "manual", lines: [{ accountId: cashId, debit: 1000, credit: 0 }, { accountId: salesId, debit: 0, credit: 1000 }] });
    await request(app.getHttpServer())
      .post("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryDate: "2021-01-15", sourceType: "manual", lines: [{ accountId: expenseId, debit: 300, credit: 0 }, { accountId: cashId, debit: 0, credit: 300 }] });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM fiscal_year_closings WHERE year = 2021`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounting_periods WHERE year = 2021`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([cashId, salesId, expenseId, retainedEarningsId])})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-period-close@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /accounting/periods/:year/:month/close بيقفل الشهر ومينفعش يترحّل عليه قيد جديد بعد كده", async () => {
    const close = await request(app.getHttpServer())
      .post("/accounting/periods/2021/1/close")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(close.status).toBe(201);
    expect(close.body.status).toBe("CLOSED");

    const blocked = await request(app.getHttpServer())
      .post("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryDate: "2021-01-20", sourceType: "manual", lines: [{ accountId: cashId, debit: 50, credit: 0 }, { accountId: salesId, debit: 0, credit: 50 }] });
    expect(blocked.status).toBe(400);

    const periods = await request(app.getHttpServer())
      .get("/accounting/periods?year=2021")
      .set("Authorization", `Bearer ${adminToken}`);
    const jan = periods.body.find((p: { month: number }) => p.month === 1);
    expect(jan.status).toBe("CLOSED");
  });

  test("POST /accounting/fiscal-year-closings من غير ما كل شهور السنة تتقفل -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/accounting/fiscal-year-closings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2021 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("لسه مفتوحة");
  });

  test("POST /accounting/fiscal-year-closings بعد قفل كل الشهور - بيحسب صافي الربح صح وبيرحّل قيد إقفال", async () => {
    for (let m = 2; m <= 12; m++) {
      const res = await request(app.getHttpServer())
        .post(`/accounting/periods/2021/${m}/close`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
    }

    const closing = await request(app.getHttpServer())
      .post("/accounting/fiscal-year-closings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2021 });
    expect(closing.status).toBe(201);
    expect(closing.body.year).toBe(2021);
    expect(closing.body.netIncome).toBe(700); // 1000 - 300

    const entry = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=${retainedEarningsId}&from=2022-01-01&to=2022-01-01`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(entry.body.lines).toHaveLength(1);
    expect(entry.body.lines[0].credit).toBe(700);

    // الحسابات المتحركة (مبيعات/مصروفات) اتصفّرت في قيد الإقفال
    const salesLedger = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=${salesId}&from=2022-01-01&to=2022-01-01`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(salesLedger.body.lines[0].debit).toBe(1000);

    const list = await request(app.getHttpServer())
      .get("/accounting/fiscal-year-closings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.some((c: { year: number }) => c.year === 2021)).toBe(true);
  });

  test("POST /accounting/fiscal-year-closings لنفس السنة تاني -> 400 (مقفولة بالفعل)", async () => {
    const res = await request(app.getHttpServer())
      .post("/accounting/fiscal-year-closings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2021 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("مقفولة بالفعل");
  });
});
