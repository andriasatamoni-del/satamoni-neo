import { AccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/account.repository";
import { JournalEntryRepository } from "../../../src/contexts/accounting/infrastructure/persistence/journal-entry.repository";
import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";
import { JournalEntry } from "../../../src/contexts/accounting/domain/journal-entry.aggregate";
import type { Database } from "../../../src/shared/database/database.token";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { and, eq, gt, inArray } from "drizzle-orm";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { dbCause, truncate } from "../helpers/db";

describe("JournalEntryRepository + DB-level invariants (trigger حقيقي)", () => {
  let db: Database;
  let accountRepo: AccountRepository;
  let entryRepo: JournalEntryRepository;
  let cashAccountId: string;
  let salesAccountId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    accountRepo = new AccountRepository(db);
    entryRepo = new JournalEntryRepository(db);

    const cash = Account.register({ code: "1010-je-جست", name: "الصندوق", accountType: "ASSET" });
    const sales = Account.register({ code: "4010-je-جست", name: "إيراد المبيعات", accountType: "REVENUE" });
    await accountRepo.save(cash);
    await accountRepo.save(sales);
    cashAccountId = cash.id;
    salesAccountId = sales.id;
  });

  afterAll(async () => {
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(accounts).where(inArray(accounts.id, [cashAccountId, salesAccountId]));
    await closeScriptDb(db);
  });

  // TRUNCATE (مش DELETE) عمدًا هنا - القيود بتتسجل POSTED فعليًا خلال التستات، والـtrigger اللي بيمنع
  // التعديل على سطور قيد POSTED (block_posted_journal_entry_line_changes) بيرفض أي DELETE عليها كمان
  // (مش بس INSERT/UPDATE) بما إنه نفس فلسفة "غير قابل للتعديل إطلاقًا". TRUNCATE بيتخطى الـrow-level
  // triggers دي تمامًا (مش زي DELETE) فمناسب هنا كأداة تنظيف تستات فقط - مش استخدام حقيقي في التطبيق.
  afterEach(async () => {
    await truncate(db, journalEntryLines, journalEntries);
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
    await db.insert(journalEntries).values({ id: entryId, entry_number: "JE-999999", entry_date: new Date(), source_type: "manual", status: "DRAFT" });

    await expect(
      dbCause(
        db.transaction(async (tx) => {
          await tx.insert(journalEntryLines).values({ journal_entry_id: entryId, account_id: cashAccountId, debit: 100, credit: 0 });
          await tx.insert(journalEntryLines).values({ journal_entry_id: entryId, account_id: salesAccountId, debit: 0, credit: 90 });
        })
      )
    ).rejects.toThrow(/غير متزن/);

    await db.delete(journalEntries).where(eq(journalEntries.id, entryId));
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
      dbCause(db.update(journalEntryLines).set({ debit: 999 }).where(and(eq(journalEntryLines.journal_entry_id, entry.id), gt(journalEntryLines.debit, 0))))
    ).rejects.toThrow(/POSTED بالفعل/);

    await expect(
      dbCause(db.delete(journalEntryLines).where(eq(journalEntryLines.journal_entry_id, entry.id)))
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
