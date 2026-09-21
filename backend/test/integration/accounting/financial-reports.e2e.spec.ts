import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e للتقارير المحاسبية الأساسية (ميزان المراجعة/دفتر الأستاذ/قائمة الدخل) - كلهم مشتقّين من نفس
// دفتر الأستاذ (accounts + journal_entries + journal_entry_lines)، مفيش حسابات موازية منفصلة
describe("Accounting Reports - ميزان المراجعة/دفتر الأستاذ/قائمة الدخل", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashId: string;
  let salesId: string;
  let cogsId: string;
  let expenseId: string;

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
      name: "أدمن-تقارير-محاسبية-جست", email: "admin-financial-reports@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-financial-reports@jest.test", password: "12345678" })
    ).body.token;

    async function createAccount(code: string, name: string, accountType: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post("/accounting/accounts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code, name, accountType });
      return res.body.id;
    }
    cashId = await createAccount("1900-تقارير-جست", "الكاش-تقارير-جست", "ASSET");
    salesId = await createAccount("4900-تقارير-جست", "مبيعات-تقارير-جست", "REVENUE");
    cogsId = await createAccount("5900-تقارير-جست", "تكلفة مبيعات-تقارير-جست", "COGS");
    expenseId = await createAccount("6900-تقارير-جست", "مصروفات-تقارير-جست", "EXPENSE");

    async function createEntry(entryDate: string, lines: { accountId: string; debit: number; credit: number }[]) {
      const res = await request(app.getHttpServer())
        .post("/accounting/journal-entries")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entryDate, sourceType: "manual", lines });
      expect(res.status).toBe(201);
    }

    // يوم 1: بيع 1000 (كاش/مبيعات) + تكلفة مبيعاته 400 (تكلفة مبيعات/كاش) + مصروف 100 (مصروفات/كاش)
    await createEntry("2020-01-10", [
      { accountId: cashId, debit: 1000, credit: 0 },
      { accountId: salesId, debit: 0, credit: 1000 },
    ]);
    await createEntry("2020-01-10", [
      { accountId: cogsId, debit: 400, credit: 0 },
      { accountId: cashId, debit: 0, credit: 400 },
    ]);
    await createEntry("2020-01-10", [
      { accountId: expenseId, debit: 100, credit: 0 },
      { accountId: cashId, debit: 0, credit: 100 },
    ]);
    // يوم 2: بيع تاني 500 (كاش/مبيعات) - عشان نختبر opening balance في دفتر الأستاذ لو حددنا from بعد يوم 1
    await createEntry("2020-01-11", [
      { accountId: cashId, debit: 500, credit: 0 },
      { accountId: salesId, debit: 0, credit: 500 },
    ]);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([cashId, salesId, cogsId, expenseId])})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-financial-reports@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /accounting/reports/trial-balance بيرجّع أرصدة متزنة (مجموع مدين = مجموع دائن)", async () => {
    const res = await request(app.getHttpServer())
      .get("/accounting/reports/trial-balance?asOf=2020-01-11")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalDebit).toBe(res.body.totalCredit);

    const cashRow = res.body.rows.find((r: { accountId: string }) => r.accountId === cashId);
    // كاش: +1000 -400 -100 +500 = 1000 (أصل، جانبه الطبيعي مدين)
    expect(cashRow.balance).toBe(1000);
    const salesRow = res.body.rows.find((r: { accountId: string }) => r.accountId === salesId);
    // مبيعات: 1000+500 = 1500 (إيراد، جانبه الطبيعي دائن)
    expect(salesRow.balance).toBe(1500);
  });

  test("GET /accounting/reports/general-ledger بيرجّع سطور الحساب مع رصيد جاري صحيح", async () => {
    const res = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=${cashId}&from=2020-01-11&to=2020-01-11`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // opening balance = رصيد الكاش بعد يوم 1: 1000-400-100 = 500
    expect(res.body.openingBalance).toBe(500);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].debit).toBe(500);
    expect(res.body.lines[0].runningBalance).toBe(1000);
    expect(res.body.closingBalance).toBe(1000);
  });

  test("GET /accounting/reports/general-ledger لحساب مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=00000000-0000-0000-0000-000000000000&from=2020-01-01&to=2020-01-31`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test("GET /accounting/reports/income-statement بيحسب صافي الربح صح (إيراد - تكلفة مبيعات - مصروفات)", async () => {
    const res = await request(app.getHttpServer())
      .get("/accounting/reports/income-statement?from=2020-01-10&to=2020-01-11")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(1500);
    expect(res.body.cogs).toBe(400);
    expect(res.body.grossProfit).toBe(1100);
    expect(res.body.totalExpenses).toBe(100);
    expect(res.body.netIncome).toBe(1000);
  });
});
