import type { JournalEntry } from "../journal-entry.aggregate";

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
}

export const JOURNAL_ENTRY_REPOSITORY = Symbol("JOURNAL_ENTRY_REPOSITORY");
