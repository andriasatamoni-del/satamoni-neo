import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لدورة القيد اليدوي DRAFT -> POST (مسودة/مراجعة) - راجع تعليق JournalEntry.register()/post()
// بالكونتكست. الفرق الجوهري عن أي قيد آلي تاني (بيع/رواتب/جرد...إلخ اللي كلها لسه بتترحّل POSTED
// مباشرة زي ما هي): القيد اليدوي بس محتاج خطوة مراجعة/ترحيل منفصلة، مش ترحيل تلقائي لحاجة محدش راجعها
describe("Accounting - قيد يدوي DRAFT/Post (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let cashId: string;
  let salesId: string;

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
      name: "أدمن-قيد-يدوي-جست", email: "admin-je-draft@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-je-draft@jest.test", password: "12345678" })
    ).body.token;

    const cashier = User.register({
      name: "كاشير-قيد-يدوي-جست", email: "cashier-je-draft@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-je-draft@jest.test", password: "12345678" })
    ).body.token;

    async function createAccount(code: string, name: string, accountType: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post("/accounting/accounts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code, name, accountType });
      return res.body.id;
    }
    cashId = await createAccount("1902-قيد-يدوي-جست", "الكاش-قيد-يدوي-جست", "ASSET");
    salesId = await createAccount("4902-قيد-يدوي-جست", "مبيعات-قيد-يدوي-جست", "REVENUE");
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${cashId}, ${salesId})`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-je-draft@jest.test', 'cashier-je-draft@jest.test')`.execute(db);
    await app.close();
  });

  let draftEntryId: string;

  test("POST /accounting/journal-entries - قيد يدوي جديد بيتسجّل DRAFT دايمًا، حتى لو العميل حاول يبعت sourceType تاني", async () => {
    const res = await request(app.getHttpServer())
      .post("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        entryDate: "2023-05-01",
        sourceType: "order_sale", // محاولة انتحال - المفروض تتجاهل، القيد لازم يفضل "manual"/DRAFT
        lines: [{ accountId: cashId, debit: 200, credit: 0 }, { accountId: salesId, debit: 0, credit: 200 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.sourceType).toBe("manual");
    expect(res.body.postedAt).toBeNull();
    draftEntryId = res.body.id;
  });

  test("قيد DRAFT مش موجود لسه في دفتر الأستاذ (لسه مش مرحّل)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=${cashId}&from=2023-05-01&to=2023-05-01`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.lines).toHaveLength(0);
  });

  test("كاشير معندوش accounting.create -> 403 على تسجيل قيد يدوي", async () => {
    const res = await request(app.getHttpServer())
      .post("/accounting/journal-entries")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ lines: [{ accountId: cashId, debit: 10, credit: 0 }, { accountId: salesId, debit: 0, credit: 10 }] });
    expect(res.status).toBe(403);
  });

  test("كاشير معندوش accounting.post -> 403 على ترحيل قيد DRAFT", async () => {
    const res = await request(app.getHttpServer())
      .post(`/accounting/journal-entries/${draftEntryId}/post`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  test("POST .../post - محاسب بصلاحية accounting.post بيرحّل القيد، وبيظهر في دفتر الأستاذ فورًا", async () => {
    const res = await request(app.getHttpServer())
      .post(`/accounting/journal-entries/${draftEntryId}/post`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("POSTED");
    expect(res.body.postedBy).not.toBeNull();
    expect(res.body.postedAt).not.toBeNull();

    const ledger = await request(app.getHttpServer())
      .get(`/accounting/reports/general-ledger?accountId=${cashId}&from=2023-05-01&to=2023-05-01`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(ledger.body.lines).toHaveLength(1);
    expect(ledger.body.lines[0].debit).toBe(200);
  });

  test("POST .../post تاني على نفس القيد -> 400 (مش DRAFT بقى)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/accounting/journal-entries/${draftEntryId}/post`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test("POST .../post على قيد مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/accounting/journal-entries/00000000-0000-0000-0000-000000000000/post")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
