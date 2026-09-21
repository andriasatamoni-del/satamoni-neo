import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e حقيقي: مصروف/مشترى نقدي بيتسجل من درج شيفت شغال -> بيتخصم من الكاش المتوقع (preview وقفل الشيفت
// كمان) -> وبيترحّل قيد محاسبي تلقائي عبر event bus (CashDrawerEntryRegistered -> Accounting)، نفس
// نمط order-sale-posting.e2e.spec.ts بالظبط
describe("Shifts: مصروفات ومشتريات درج الكاشير", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let cashAccountId: string;
  let expenseAccountId: string;
  let inventoryAccountId: string;

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
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-درج-جست", email: "admin-cash-drawer-e2e@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-cash-drawer-e2e@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع درج-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const accountRepo = new KyselyAccountRepository(db);
    const cash = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    const expense = Account.register({ code: "6900", name: "مصروفات تشغيلية", accountType: "EXPENSE", isSystemAccount: true });
    const inventory = Account.register({ code: "1400", name: "المخزون", accountType: "ASSET", isSystemAccount: true });
    await accountRepo.save(cash);
    await accountRepo.save(expense);
    await accountRepo.save(inventory);
    cashAccountId = cash.id;
    expenseAccountId = expense.id;
    inventoryAccountId = inventory.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([cashAccountId, expenseAccountId, inventoryAccountId])})`.execute(db);
    await sql`DELETE FROM cash_drawer_entries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM cashier_shifts WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-cash-drawer-e2e@jest.test'`.execute(db);
    await app.close();
  });

  test("المصروفات والمشتريات بتتخصم من الكاش المتوقع وبتترحّل محاسبيًا", async () => {
    const openRes = await request(app.getHttpServer())
      .post("/shifts/open")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, openingCash: 500 });
    expect(openRes.status).toBe(201);
    const shiftId = openRes.body.id;

    const expenseRes = await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/cash-drawer-entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryType: "EXPENSE", amount: 50, label: "فاتورة كهرباء" });
    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.entryType).toBe("EXPENSE");

    const purchaseRes = await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/cash-drawer-entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryType: "PURCHASE", amount: 120, label: "خضار من السوق" });
    expect(purchaseRes.status).toBe(201);

    const listRes = await request(app.getHttpServer())
      .get(`/shifts/${shiftId}/cash-drawer-entries`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(2);

    const previewRes = await request(app.getHttpServer())
      .get(`/shifts/${shiftId}/preview`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(previewRes.status).toBe(200);
    // متوقع = 500 (افتتاحي) + 0 (مبيعات كاش) - 50 (مصروف) - 120 (مشترى) = 330
    expect(previewRes.body.expectedCash).toBe(330);
    expect(previewRes.body.cashExpensesTotal).toBe(50);
    expect(previewRes.body.cashPurchasesTotal).toBe(120);

    const closeRes = await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ actualCash: 330 });
    expect(closeRes.status).toBe(201);
    expect(closeRes.body.status).toBe("CLOSED");
    expect(closeRes.body.cashVariance).toBe(0);
    expect(closeRes.body.cashExpensesTotal).toBe(50);
    expect(closeRes.body.cashPurchasesTotal).toBe(120);

    const journalRes = await request(app.getHttpServer())
      .get(`/accounting/journal-entries?sourceType=cash_drawer_entry`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalRes.status).toBe(200);

    const expenseEntry = journalRes.body.find((e: { sourceId: string }) => e.sourceId === expenseRes.body.id);
    expect(expenseEntry).toBeTruthy();
    expect(expenseEntry.status).toBe("POSTED");
    const expenseCashLine = expenseEntry.lines.find((l: { accountId: string }) => l.accountId === cashAccountId);
    const expenseDebitLine = expenseEntry.lines.find((l: { accountId: string }) => l.accountId === expenseAccountId);
    expect(Number(expenseCashLine.credit)).toBe(50);
    expect(Number(expenseDebitLine.debit)).toBe(50);

    const purchaseEntry = journalRes.body.find((e: { sourceId: string }) => e.sourceId === purchaseRes.body.id);
    expect(purchaseEntry).toBeTruthy();
    const purchaseCashLine = purchaseEntry.lines.find((l: { accountId: string }) => l.accountId === cashAccountId);
    const purchaseDebitLine = purchaseEntry.lines.find((l: { accountId: string }) => l.accountId === inventoryAccountId);
    expect(Number(purchaseCashLine.credit)).toBe(120);
    expect(Number(purchaseDebitLine.debit)).toBe(120);
  });

  test("تسجيل مصروف على شيفت مقفول بيرمي خطأ", async () => {
    const openRes = await request(app.getHttpServer())
      .post("/shifts/open")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, openingCash: 200 });
    const shiftId = openRes.body.id;
    await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ actualCash: 200 });

    const res = await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/cash-drawer-entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entryType: "EXPENSE", amount: 10, label: "أي حاجة" });
    expect(res.status).toBe(400);
  });
});
