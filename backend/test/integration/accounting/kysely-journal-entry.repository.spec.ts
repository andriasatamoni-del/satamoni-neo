import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyAccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository";
import { KyselyJournalEntryRepository } from "../../../src/contexts/accounting/infrastructure/persistence/kysely-journal-entry.repository";
import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";
import { JournalEntry } from "../../../src/contexts/accounting/domain/journal-entry.aggregate";

describe("KyselyJournalEntryRepository + DB-level invariants (trigger حقيقي)", () => {
  let db: Kysely<Database>;
  let accountRepo: KyselyAccountRepository;
  let entryRepo: KyselyJournalEntryRepository;
  let cashAccountId: string;
  let salesAccountId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    accountRepo = new KyselyAccountRepository(db);
    entryRepo = new KyselyJournalEntryRepository(db);

    const cash = Account.register({ code: "1010-je-جست", name: "الصندوق", accountType: "ASSET" });
    const sales = Account.register({ code: "4010-je-جست", name: "إيراد المبيعات", accountType: "REVENUE" });
    await accountRepo.save(cash);
    await accountRepo.save(sales);
    cashAccountId = cash.id;
    salesAccountId = sales.id;
  });

  afterAll(async () => {
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([cashAccountId, salesAccountId])})`.execute(db);
    await db.destroy();
  });

  // TRUNCATE (مش DELETE) عمدًا هنا - القيود بتتسجل POSTED فعليًا خلال التستات، والـtrigger اللي بيمنع
  // التعديل على سطور قيد POSTED (block_posted_journal_entry_line_changes) بيرفض أي DELETE عليها كمان
  // (مش بس INSERT/UPDATE) بما إنه نفس فلسفة "غير قابل للتعديل إطلاقًا". TRUNCATE بيتخطى الـrow-level
  // triggers دي تمامًا (مش زي DELETE) فمناسب هنا كأداة تنظيف تستات فقط - مش استخدام حقيقي في التطبيق.
  afterEach(async () => {
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
  });

  test("save بيسجّل قيد بسطوره ويحدد entryNumber من الـsequence بصيغة JE-xxxxxx", async () => {
    const entry = JournalEntry.register({
      sourceType: "manual",
      lines: [
        { accountId: cashAccountId, debit: 200, credit: 0 },
        { accountId: salesAccountId, debit: 0, credit: 200 },
      ],
    });
    await entryRepo.save(entry);

    expect(entry.entryNumber).toMatch(/^JE-\d{6}$/);
    const found = await entryRepo.findById(entry.id);
    expect(found?.lines).toHaveLength(2);
  });

  test("list بيفلتر بالـsourceType صح", async () => {
    const entry = JournalEntry.register({
      sourceType: "order_sale",
      lines: [
        { accountId: cashAccountId, debit: 50, credit: 0 },
        { accountId: salesAccountId, debit: 0, credit: 50 },
      ],
    });
    await entryRepo.save(entry);

    const found = await entryRepo.list({ sourceType: "order_sale" });
    expect(found.map((e) => e.id)).toContain(entry.id);
    expect(await entryRepo.list({ sourceType: "ghost_source" })).toHaveLength(0);
  });

  // الاختبار الأهم هنا: التحقق الفعلي حقيقي على مستوى القاعدة نفسها، مش بس اعتماد على الدومين -
  // بنتخطّى الدومين عمدًا (INSERT مباشر) عشان نتأكد إن الـtrigger شغّال فعلًا لوحده
  test("الـDB trigger بيرفض فعليًا قيد غير متزن حتى لو اتحط مباشرة من غير الدومين", async () => {
    // الحالة هنا DRAFT عمدًا (مش POSTED) - عشان نعزل تحقق "الاتزان" لوحده، من غير ما يتقطع بتريجر
    // "منع تعديل قيد POSTED" اللي هيرفض أي INSERT على سطور قيد POSTED من الأساس قبل ما يوصل لتحقق الاتزان
    const entryId = crypto.randomUUID();
    await sql`INSERT INTO journal_entries (id, entry_number, entry_date, source_type, status)
               VALUES (${entryId}, 'JE-999999', now(), 'manual', 'DRAFT')`.execute(db);

    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto("journal_entry_lines").values({ journal_entry_id: entryId, account_id: cashAccountId, debit: 100, credit: 0 }).execute();
        await trx.insertInto("journal_entry_lines").values({ journal_entry_id: entryId, account_id: salesAccountId, debit: 0, credit: 90 }).execute();
      })
    ).rejects.toThrow(/غير متزن/);

    await sql`DELETE FROM journal_entries WHERE id = ${entryId}`.execute(db);
  });

  test("الـDB trigger بيرفض فعليًا أي تعديل على سطور قيد POSTED", async () => {
    // sourceType غير "manual" عمدًا هنا - القيد اليدوي بقى بيتسجل DRAFT (راجع تعليق
    // JournalEntry.register())، والاختبار ده بيتأكد من قابلية التعديل لقيد POSTED فعليًا، مش من حالة
    // القيد وقت التسجيل
    const entry = JournalEntry.register({
      sourceType: "order_sale",
      lines: [
        { accountId: cashAccountId, debit: 75, credit: 0 },
        { accountId: salesAccountId, debit: 0, credit: 75 },
      ],
    });
    await entryRepo.save(entry);

    await expect(
      sql`UPDATE journal_entry_lines SET debit = 999 WHERE journal_entry_id = ${entry.id} AND debit > 0`.execute(db)
    ).rejects.toThrow(/POSTED بالفعل/);

    await expect(
      sql`DELETE FROM journal_entry_lines WHERE journal_entry_id = ${entry.id}`.execute(db)
    ).rejects.toThrow(/POSTED بالفعل/);
  });

  test("markReversed بيحدّث حالة القيد الأصلي من غير ما يلمس سطوره", async () => {
    const entry = JournalEntry.register({
      sourceType: "order_sale",
      lines: [
        { accountId: cashAccountId, debit: 30, credit: 0 },
        { accountId: salesAccountId, debit: 0, credit: 30 },
      ],
    });
    await entryRepo.save(entry);

    const reversedAt = new Date();
    await entryRepo.markReversed(entry.id, reversedAt);

    const found = await entryRepo.findById(entry.id);
    expect(found?.status).toBe("REVERSED");
    expect(found?.lines).toHaveLength(2); // السطور زي ما هي
  });
});
