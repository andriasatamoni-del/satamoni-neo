import type { JournalEntry } from "../journal-entry.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the journal entries list. `from`/`to` are inclusive dates on entry_date; `q` matches the number or description.
export interface JournalEntryListFilter {
  branchId?: string;
  sourceType?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface JournalEntryRepositoryPort {
  // بيسجّل القيد لأول مرة، بيحدد entryNumber من الـsequence، وبيرجّع نفس الـaggregate بعد ما
  // assignEntryNumber() يتنفّذ عليه - القيود POSTED مش قابلة للتعديل تاني بعد كده (save() تاني على
  // نفس الـid هيترفض من الـDB trigger نفسه لو حصل، مش بس اعتماد على التطبيق)
  save(entry: JournalEntry): Promise<void>;
  // القيد الأصلي بيتعلّم إنه اترجع منه قيد عكسي - status/reversed_at بس، مش أي حاجة في سطوره
  markReversed(entryId: string, reversedAt: Date): Promise<void>;
  // ترحيل قيد يدوي DRAFT -> POSTED - status/posted_by/posted_at بس، مش أي حاجة في سطوره (نفس نمط
  // markReversed). بيتحقق من الفترة المحاسبية قبل الترحيل (دفاع تطبيقي أول، والـtrigger
  // trg_prevent_posting_to_closed_period هو الدفاع الحقيقي التاني)
  postEntry(entryId: string, postedAt: Date, postedBy: string | null): Promise<void>;
  findById(id: string): Promise<JournalEntry | null>;
  list(filter?: { branchId?: string; sourceType?: string }): Promise<JournalEntry[]>;
  search(filter: JournalEntryListFilter, page?: PageRequest): Promise<{ entries: JournalEntry[]; total: number }>;
  // Phase 3.1: indexed lookup of the entries produced by one business transaction (idempotent posting / reversal)
  findBySource(sourceType: string, sourceId: string): Promise<JournalEntry[]>;
}

export const JOURNAL_ENTRY_REPOSITORY = Symbol("JOURNAL_ENTRY_REPOSITORY");
