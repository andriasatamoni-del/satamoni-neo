import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { JournalEntry, type JournalEntryStatus } from "../../domain/journal-entry.aggregate";
import type { JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import type { JournalEntriesTable, JournalEntryLinesTable } from "./accounting.schema";
import { AccountingPeriodClosedError } from "../../domain/errors";

@Injectable()
export class KyselyJournalEntryRepository implements JournalEntryRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // القيود append-only بمجرد ما تتسجّل (POSTED) - مفيش onConflict/update هنا عمدًا، أي محاولة تعديل
  // حقيقية هتترفض من الـDB trigger نفسه (block_posted_journal_entry_line_changes) - نفس فلسفة الريبو
  // القديم بالظبط، الحماية مش بس "التطبيق مبيحاولش يعدّل"
  async save(entry: JournalEntry): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      let entryNumber = entry.entryNumber;
      if (!entryNumber) {
        const { rows } = await sql<{ nextval: string }>`SELECT nextval('journal_entry_number_seq')`.execute(trx);
        entryNumber = `JE-${String(rows[0].nextval).padStart(6, "0")}`;
        entry.assignEntryNumber(entryNumber);
      }

      // بيتسجّل الصف الأصلي بحالة DRAFT مؤقتًا (بغض النظر عن حالة entry الفعلية) عشان الـtrigger اللي
      // بيمنع تعديل سطور قيد POSTED (block_posted_journal_entry_line_changes) يسمح بإدخال السطور وقت
      // الإنشاء نفسه - لو اتسجّل بحالته النهائية من الأول، الـtrigger هيرفض حتى أول إدخال للسطور. الحالة
      // بتتحدّث لحالتها الحقيقية (POSTED غالبًا) بعد ما كل السطور تتسجّل، فبعد كده أي محاولة تعديل فعلية
      // هترفض زي ما المفروض بالظبط.
      await trx
        .insertInto("journal_entries")
        .values({
          id: entry.id,
          entry_number: entryNumber,
          entry_date: entry.entryDate,
          description: entry.description,
          source_type: entry.sourceType,
          source_id: entry.sourceId,
          branch_id: entry.branchId,
          status: "DRAFT",
          created_by: entry.createdBy,
          posted_at: null,
          reversed_at: null,
          reversal_of_entry_id: entry.reversalOfEntryId,
          reversal_reason: entry.reversalReason,
          created_at: entry.createdAt,
        })
        .execute();

      for (const line of entry.lines) {
        await trx
          .insertInto("journal_entry_lines")
          .values({
            id: line.id,
            journal_entry_id: entry.id,
            account_id: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            reference_type: line.referenceType,
            reference_id: line.referenceId,
          })
          .execute();
      }

      if (entry.status !== "DRAFT") {
        // تحقق تطبيقي (رسالة خطأ واضحة) قبل ما نوصل لتريجر القاعدة (trg_prevent_posting_to_closed_period
        // في migration 035) اللي هو الدفاع الحقيقي - نفس فلسفة اتزان القيد (تحقق في الدومين + تريجر مزدوج)
        const year = entry.entryDate.getUTCFullYear();
        const month = entry.entryDate.getUTCMonth() + 1;
        const period = await trx
          .selectFrom("accounting_periods")
          .select("status")
          .where("year", "=", year)
          .where("month", "=", month)
          .executeTakeFirst();
        if (period?.status === "CLOSED") throw new AccountingPeriodClosedError(year, month);

        await trx
          .updateTable("journal_entries")
          .set({ status: entry.status, posted_at: entry.postedAt, reversed_at: entry.reversedAt })
          .where("id", "=", entry.id)
          .execute();
      }
    });
  }

  // بيتنفّذ لما قيد POSTED يترجع منه قيد عكسي (reverse()) - التحديث الوحيد المسموح بيه على journal_
  // entries نفسه (مش journal_entry_lines) هو status/reversed_at، مسموح بيه صراحة (مش القيد اللي بيتغيّر
  // جوهريًا، مجرد علامة "اترجع منه قيد تاني")
  async markReversed(entryId: string, reversedAt: Date): Promise<void> {
    await this.db
      .updateTable("journal_entries")
      .set({ status: "REVERSED", reversed_at: reversedAt })
      .where("id", "=", entryId)
      .execute();
  }

  async findById(id: string): Promise<JournalEntry | null> {
    const row = await this.db.selectFrom("journal_entries").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; sourceType?: string }): Promise<JournalEntry[]> {
    let query = this.db.selectFrom("journal_entries").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.sourceType) query = query.where("source_type", "=", filter.sourceType);
    const rows = await query.orderBy("created_at", "desc").execute();
    const entries: JournalEntry[] = [];
    for (const row of rows) entries.push(this.toDomain(row, await this.loadLines(row.id)));
    return entries;
  }

  private loadLines(entryId: string): Promise<Selectable<JournalEntryLinesTable>[]> {
    return this.db.selectFrom("journal_entry_lines").selectAll().where("journal_entry_id", "=", entryId).execute();
  }

  private toDomain(row: Selectable<JournalEntriesTable>, lineRows: Selectable<JournalEntryLinesTable>[]): JournalEntry {
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
      postedAt: row.posted_at,
      reversedAt: row.reversed_at,
      reversalOfEntryId: row.reversal_of_entry_id,
      reversalReason: row.reversal_reason,
      createdAt: row.created_at,
    });
  }
}
