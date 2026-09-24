import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لتسجيل المصروفات (expenses/expense_categories) - راجع تعليق expense.aggregate.ts للفلسفة
// (نسخة مبسّطة من دورة حياة الريبو القديم الرباعية). محاسب/مدير فرع بيقدروا يرحّلوا فورًا أو
// يستخدموا مسار المراجعة، وكاشير مقفول على فرعه/تسجيل SUBMITTED بس
describe("Expenses - تسجيل المصروفات (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let branchId: string;
  let categoryId: string;
  let categoryWithAccountId: string;
  let linkedAccountId: string;
  let cashAccountId: string;
  let defaultExpenseAccountId: string;

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
      name: "أدمن-مصروفات-جست", email: "admin-expenses@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-expenses@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-مصروفات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const cashier = User.register({
      name: "كاشير-مصروفات-جست", email: "cashier-expenses@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier", branchId,
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-expenses@jest.test", password: "12345678" })
    ).body.token;

    // حسابات النظام الحقيقية اللي الـhandler بيعتمد عليها كـfallback (1100 كاش، 6900 مصروفات تشغيل
    // أخرى) - نفس نمط order-sale-posting.e2e.spec.ts بالظبط: كل ملف اختبار محتاج الحسابات دي بيسجّلها
    // بنفسه في beforeAll وبيمسحها في afterAll
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");
    const accountRepo = new KyselyAccountRepository(db);
    const cash = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    const defaultExpense = Account.register({ code: "6900", name: "مصروفات تشغيل أخرى", accountType: "EXPENSE", isSystemAccount: true });
    await accountRepo.save(cash);
    await accountRepo.save(defaultExpense);
    cashAccountId = cash.id;
    defaultExpenseAccountId = defaultExpense.id;

    const catRes = await request(app.getHttpServer())
      .post("/expenses/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فاتورة مياه-مصروفات-جست" });
    categoryId = catRes.body.id;

    const accRes = await request(app.getHttpServer())
      .post("/accounting/accounts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "6950-مصروفات-جست", name: "صيانة-مصروفات-جست", accountType: "EXPENSE" });
    linkedAccountId = accRes.body.id;
    const catWithAccRes = await request(app.getHttpServer())
      .post("/expenses/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "صيانة-مصروفات-جست", accountId: linkedAccountId });
    categoryWithAccountId = catWithAccRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM expenses WHERE branch_id = ${branchId}`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM expense_categories WHERE id IN (${categoryId}, ${categoryWithAccountId})`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${linkedAccountId}, ${cashAccountId}, ${defaultExpenseAccountId})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-expenses@jest.test', 'cashier-expenses@jest.test')`.execute(db);
    await app.close();
  });

  test("POST /expenses بدون status -> POSTED فورًا، بيترحّل قيد محاسبي (6900 الافتراضي لبند من غير حساب مرتبط)", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", categoryId, amount: 250 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("POSTED");
    expect(res.body.journalEntryId).not.toBeNull();

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore + 1);
    const entry = journalAfter.body.find((e: { id: string }) => e.id === res.body.journalEntryId);
    expect(entry.status).toBe("POSTED");
    expect(entry.sourceType).toBe("expense");
  });

  test("بند مرتبط بحساب محدد -> القيد بيترحّل على الحساب المرتبط مش 6900", async () => {
    const res = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", categoryId: categoryWithAccountId, amount: 400 });
    expect(res.status).toBe(201);

    const journalList = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    const entry = journalList.body.find((e: { id: string }) => e.id === res.body.journalEntryId);
    const debitLine = entry.lines.find((l: { debit: number }) => l.debit > 0);
    expect(debitLine.accountId).toBe(linkedAccountId);
  });

  let draftExpenseId: string;

  test("POST /expenses بـstatus=DRAFT -> مفيش ترحيل خالص", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-02", categoryId, amount: 80, status: "DRAFT" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.journalEntryId).toBeNull();
    draftExpenseId = res.body.id;

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore);
  });

  test("PATCH /expenses/:id بيعدّل مصروف SUBMITTED بعد submit، وPOST .../submit بيحوّله من DRAFT", async () => {
    const submitRes = await request(app.getHttpServer())
      .post(`/expenses/${draftExpenseId}/submit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe("SUBMITTED");

    const editRes = await request(app.getHttpServer())
      .patch(`/expenses/${draftExpenseId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: 95 });
    expect(editRes.status).toBe(200);
    expect(editRes.body.amount).toBe(95);
  });

  test("POST .../review - SUBMITTED -> POSTED مباشرة (اعتماد+ترحيل في خطوة واحدة)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/expenses/${draftExpenseId}/review`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("POSTED");
    expect(res.body.journalEntryId).not.toBeNull();
  });

  test("PATCH /expenses/:id على مصروف POSTED -> 400 (مش SUBMITTED بقى)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/expenses/${draftExpenseId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: 1 });
    expect(res.status).toBe(400);
  });

  test("كاشير: تسجيل مصروف بيتفرض SUBMITTED وفرعه بغض النظر عن اللي اتبعت", async () => {
    const res = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId: "00000000-0000-0000-0000-000000000000", businessDate: "2020-01-01", categoryId, amount: 30, status: "POSTED" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SUBMITTED"); // اتجاهل status المبعوت، وفُرض SUBMITTED
    expect(res.body.branchId).toBe(branchId); // اتجاهل branchId المبعوت، وفُرض فرعه هو
  });

  test("كاشير معندوش expenses.create -> 403 لو حاول يعتمد (review) مصروف", async () => {
    const res = await request(app.getHttpServer())
      .post(`/expenses/${draftExpenseId}/review`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  test("POST .../cancel - إلغاء مصروف SUBMITTED من غير أثر محاسبي", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-03", categoryId, amount: 20, status: "SUBMITTED" });

    const res = await request(app.getHttpServer())
      .post(`/expenses/${createRes.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "اتسجّل غلط" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CANCELLED");
  });

  test("POST .../cancel على مصروف POSTED -> 400 (مسار الإلغاء ده مش لقيود مرحّلة)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/expenses/${draftExpenseId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "محاولة" });
    expect(res.status).toBe(400);
  });

  test("GET /expenses?branchId= بيرجّع سجل الفرع", async () => {
    const res = await request(app.getHttpServer())
      .get(`/expenses?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("GET /expenses كاشير - بيشوف فرعه بس بغض النظر عن branchId المبعوت", async () => {
    const res = await request(app.getHttpServer())
      .get("/expenses?branchId=00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((e: { branchId: string }) => e.branchId === branchId)).toBe(true);
  });
});
