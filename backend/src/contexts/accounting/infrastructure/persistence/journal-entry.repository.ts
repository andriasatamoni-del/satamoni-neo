import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { DATABASE, type Database, type DatabaseTx } from "../../../../shared/database/database.token";
import { JournalEntry, type JournalEntryStatus } from "../../domain/journal-entry.aggregate";
import type { JournalEntryListFilter, JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { dateRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { AccountingPeriodClosedError } from "../../domain/errors";
import { accountingPeriods, journalEntries, journalEntryLines } from "./accounting.tables";

@Injectable()
export class JournalEntryRepository implements JournalEntryRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // القيود append-only بمجرد ما تتسجّل (POSTED) - مفيش onConflict/update هنا عمدًا، أي محاولة تعديل
  // حقيقية هتترفض من الـDB trigger نفسه (block_posted_journal_entry_line_changes) - نفس فلسفة الريبو
  // القديم بالظبط، الحماية مش بس "التطبيق مبيحاولش يعدّل"
  async save(entry: JournalEntry): Promise<void> {
    await this.db.transaction(async (tx) => {
      let entryNumber = entry.entryNumber;
      if (!entryNumber) {
        // nextval() has no builder method: select it as a fragment from a one-row VALUES list
        const [row] = await tx
          .select({ nextval: sql<string>`nextval('journal_entry_number_seq')` })
          .from(sql`(VALUES (1)) AS seq`);
        entryNumber = `JE-${String(row.nextval).padStart(6, "0")}`;
        entry.assignEntryNumber(entryNumber);
      }

      // بيتسجّل الصف الأصلي بحالة DRAFT مؤقتًا (بغض النظر عن حالة entry الفعلية) عشان الـtrigger اللي
      // بيمنع تعديل سطور قيد POSTED (block_posted_journal_entry_line_changes) يسمح بإدخال السطور وقت
      // الإنشاء نفسه - لو اتسجّل بحالته النهائية من الأول، الـtrigger هيرفض حتى أول إدخال للسطور. الحالة
      // بتتحدّث لحالتها الحقيقية (POSTED غالبًا) بعد ما كل السطور تتسجّل، فبعد كده أي محاولة تعديل فعلية
      // هترفض زي ما المفروض بالظبط.
      await tx.insert(journalEntries).values({
        id: entry.id,
        entry_number: entryNumber,
        entry_date: entry.entryDate,
        description: entry.description,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        branch_id: entry.branchId,
        status: "DRAFT",
        created_by: entry.createdBy,
        posted_by: null,
        posted_at: null,
        reversed_at: null,
        reversal_of_entry_id: entry.reversalOfEntryId,
        reversal_reason: entry.reversalReason,
        created_at: entry.createdAt,
      });

      for (const line of entry.lines) {
        await tx.insert(journalEntryLines).values({
          id: line.id,
          journal_entry_id: entry.id,
          account_id: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          reference_type: line.referenceType,
          reference_id: line.referenceId,
        });
      }

      if (entry.status !== "DRAFT") {
        // تحقق تطبيقي (رسالة خطأ واضحة) قبل ما نوصل لتريجر القاعدة (trg_prevent_posting_to_closed_period
        // في migration 035) اللي هو الدفاع الحقيقي - نفس فلسفة اتزان القيد (تحقق في الدومين + تريجر مزدوج)
        await this.assertPeriodOpen(tx, entry.entryDate);

        await tx
          .update(journalEntries)
          .set({ status: entry.status, posted_by: entry.postedBy, posted_at: entry.postedAt, reversed_at: entry.reversedAt })
          .where(eq(journalEntries.id, entry.id));
      }
    });
  }

  // ترحيل قيد يدوي DRAFT -> POSTED - status/posted_by/posted_at بس، مش أي حاجة في سطوره (نفس نمط
  // markReversed تمامًا). الـtrigger trg_prevent_posting_to_closed_period (migration 035) هو الدفاع
  // الحقيقي التاني - هنا دفاع تطبيقي أول برسالة خطأ واضحة، نفس فلسفة save() بالظبط
  async postEntry(entryId: string, postedAt: Date, postedBy: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select({ entry_date: journalEntries.entry_date }).from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1);
      if (!row) throw new Error(`journal entry ${entryId} not found`);
      await this.assertPeriodOpen(tx, row.entry_date);

      await tx
        .update(journalEntries)
        .set({ status: "POSTED", posted_by: postedBy, posted_at: postedAt })
        .where(eq(journalEntries.id, entryId));
    });
  }

  // بيتنفّذ لما قيد POSTED يترجع منه قيد عكسي (reverse()) - التحديث الوحيد المسموح بيه على journal_
  // entries نفسه (مش journal_entry_lines) هو status/reversed_at، مسموح بيه صراحة (مش القيد اللي بيتغيّر
  // جوهريًا، مجرد علامة "اترجع منه قيد تاني")
  async markReversed(entryId: string, reversedAt: Date): Promise<void> {
    await this.db.update(journalEntries).set({ status: "REVERSED", reversed_at: reversedAt }).where(eq(journalEntries.id, entryId));
  }

  async findById(id: string): Promise<JournalEntry | null> {
    const [row] = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; sourceType?: string }): Promise<JournalEntry[]> {
    const rows = await this.db
      .select()
      .from(journalEntries)
      .where(
        and(
          filter?.branchId ? eq(journalEntries.branch_id, filter.branchId) : undefined,
          filter?.sourceType ? eq(journalEntries.source_type, filter.sourceType) : undefined
        )
      )
      .orderBy(desc(journalEntries.created_at));
    return this.withLines(rows);
  }

  async search(filter: JournalEntryListFilter, page?: PageRequest): Promise<{ entries: JournalEntry[]; total: number }> {
    const where = and(
      filter.branchId ? eq(journalEntries.branch_id, filter.branchId) : undefined,
      filter.sourceType ? eq(journalEntries.source_type, filter.sourceType) : undefined,
      filter.status ? eq(journalEntries.status, filter.status) : undefined,
      dateRangeCondition(journalEntries.entry_date, filter.from, filter.to),
      searchCondition(filter.q, journalEntries.entry_number, journalEntries.description)
    );
    const query = this.db
      .select()
      .from(journalEntries)
      .where(where)
      .orderBy(
        ...orderByOf(
          { createdAt: journalEntries.created_at, entryDate: journalEntries.entry_date },
          filter.sort,
          filter.order,
          { key: "createdAt", order: "desc" },
          journalEntries.id
        )
      )
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(journalEntries).where(where)));
    return { entries: await this.withLines(rows), total };
  }

  // NEO-6: the lines of many entries in one query per 1000 entries instead of one per entry
  private async withLines(rows: (typeof journalEntries.$inferSelect)[]): Promise<JournalEntry[]> {
    const lines: (typeof journalEntryLines.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      lines.push(...(await this.db.select().from(journalEntryLines).where(inArray(journalEntryLines.journal_entry_id, ids))));
    }
    const byEntry = groupBy(lines, (l) => l.journal_entry_id);
    return rows.map((row) => this.toDomain(row, byEntry.get(row.id) ?? []));
  }

  async findBySource(sourceType: string, sourceId: string): Promise<JournalEntry[]> {
    const rows = await this.db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.source_type, sourceType), eq(journalEntries.source_id, sourceId)))
      .orderBy(asc(journalEntries.created_at));
    const entries: JournalEntry[] = [];
    for (const row of rows) entries.push(this.toDomain(row, await this.loadLines(row.id)));
    return entries;
  }

  private async assertPeriodOpen(tx: DatabaseTx, entryDate: Date): Promise<void> {
    const year = entryDate.getUTCFullYear();
    const month = entryDate.getUTCMonth() + 1;
    const [period] = await tx
      .select({ status: accountingPeriods.status })
      .from(accountingPeriods)
      .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
      .limit(1);
    if (period?.status === "CLOSED") throw new AccountingPeriodClosedError(year, month);
  }

  private loadLines(entryId: string): Promise<(typeof journalEntryLines.$inferSelect)[]> {
    return this.db.select().from(journalEntryLines).where(eq(journalEntryLines.journal_entry_id, entryId));
  }

  private toDomain(row: typeof journalEntries.$inferSelect, lineRows: (typeof journalEntryLines.$inferSelect)[]): JournalEntry {
    return JournalEntry.reconstitute(row.id, {
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      description: row.description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      branchId: row.branch_id,
      status: row.status as JournalEntryStatus,
      lines: lineRows.map((l) => ({
        id: l.id,
        accountId: l.account_id,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
        referenceType: l.reference_type,
        referenceId: l.reference_id,
      })),
      createdBy: row.created_by,
      postedBy: row.posted_by,
      postedAt: row.posted_at,
      reversedAt: row.reversed_at,
      reversalOfEntryId: row.reversal_of_entry_id,
      reversalReason: row.reversal_reason,
      createdAt: row.created_at,
    });
  }
}
