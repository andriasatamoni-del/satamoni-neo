import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e حقيقي بيثبت إن الـdomain event bus شغّال فعليًا عبر الـcontexts: تسجيل طلب (Orders) ->
// OrderRegisteredEvent -> Accounting (subscriber) بيترحّل قيد بيع تلقائي POSTED على حسابي الكاش/مبيعات
// الطعام (1100/4100) - نفس الأكواد الحقيقية اللي هيستوردها سكريبت استيراد دليل الحسابات
describe("Orders -> EventBus -> Accounting (قيد بيع تلقائي)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let cashAccountId: string;
  let salesAccountId: string;

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
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-محاسبة", email: "admin-accounting-e2e@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-accounting-e2e@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع محاسبة-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "ساندوتش-محاسبة-جست" });
    const variant = item.addVariant({ label: "عادي", price: 75 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const accountRepo = new KyselyAccountRepository(db);
    const cash = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    const sales = Account.register({ code: "4100", name: "مبيعات الطعام", accountType: "REVENUE", isSystemAccount: true });
    await accountRepo.save(cash);
    await accountRepo.save(sales);
    cashAccountId = cash.id;
    salesAccountId = sales.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    // TRUNCATE عمدًا (مش DELETE) - القيود اتسجّلت POSTED فعليًا، وDELETE هيترفض من الـtrigger اللي
    // بيمنع أي تعديل على سطور قيد POSTED (نفس السبب في kysely-journal-entry.repository.spec.ts)
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([cashAccountId, salesAccountId])})`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-accounting-e2e@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /orders بينشر حدث بيترحّل قيد بيع POSTED متزن تلقائي على الكاش/المبيعات", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 3 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(225); // 3 * 75

    const entries = await request(app.getHttpServer())
      .get(`/accounting/journal-entries?sourceType=order_sale`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(entries.status).toBe(200);
    const posted = entries.body.find((e: { sourceId: string }) => e.sourceId === res.body.id);
    expect(posted).toBeTruthy();
    expect(posted.status).toBe("POSTED");
    expect(posted.lines).toHaveLength(2);
    const cashLine = posted.lines.find((l: { accountId: string }) => l.accountId === cashAccountId);
    const salesLine = posted.lines.find((l: { accountId: string }) => l.accountId === salesAccountId);
    expect(Number(cashLine.debit)).toBe(225);
    expect(Number(cashLine.credit)).toBe(0);
    expect(Number(salesLine.debit)).toBe(0);
    expect(Number(salesLine.credit)).toBe(225);
  });
});
