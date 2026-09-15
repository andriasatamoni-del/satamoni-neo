import { randomUUID } from "node:crypto";
import {
  EmptyJournalEntryError,
  InvalidJournalEntryLineError,
  JournalEntryAlreadyReversedError,
  JournalEntryNotPostedError,
  UnbalancedJournalEntryError,
} from "./errors";

export const JOURNAL_ENTRY_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;
export type JournalEntryStatus = (typeof JOURNAL_ENTRY_STATUSES)[number];

export interface JournalEntryLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
}

export interface JournalEntryProps {
  entryNumber: string | null; // بيتحدد وقت الحفظ الأول بس (sequence، راجع KyselyJournalEntryRepository) - نفس فلسفة id المولّد من القاعدة
  entryDate: Date;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  branchId: string | null;
  status: JournalEntryStatus;
  lines: JournalEntryLine[];
  createdBy: string | null;
  postedAt: Date | null;
  reversedAt: Date | null;
  reversalOfEntryId: string | null;
  reversalReason: string | null;
  createdAt: Date;
}

// JournalEntry - نفس مفهوم journal_entries+journal_entry_lines في الريبو القديم بنفس القواعد الجوهرية
// بالظبط (مش إعادة تصميم): كل قيد لازم يكون متزن (مجموع مدين = مجموع دائن)، كل سطر مدين أو دائن مش
// الاتنين، وقيد POSTED غير قابل للتعديل إطلاقًا - أي تصحيح لازم قيد عكسي جديد (reverse()) مش تعديل
// مباشر. التحقق هنا على مستوى الدومين (defense أول)، ومتكرر تاني بـtrigger حقيقي على مستوى القاعدة
// (migration 009_create_accounting_tables) - نفس فلسفة الريبو القديم بالضبط ("مش تطبيقي بس").
export class JournalEntry {
  private constructor(
    public readonly id: string,
    private props: JournalEntryProps
  ) {}

  static register(input: {
    entryDate?: Date;
    description?: string | null;
    sourceType: string;
    sourceId?: string | null;
    branchId?: string | null;
    lines: { accountId: string; debit: number; credit: number; description?: string | null; referenceType?: string | null; referenceId?: string | null }[];
    createdBy?: string | null;
  }): JournalEntry {
    if (input.lines.length < 2) throw new EmptyJournalEntryError();

    let totalDebit = 0;
    let totalCredit = 0;
    const lines: JournalEntryLine[] = input.lines.map((l) => {
      const hasDebit = l.debit > 0;
      const hasCredit = l.credit > 0;
      if (hasDebit === hasCredit) throw new InvalidJournalEntryLineError(); // الاتنين موجبين، أو الاتنين صفر
      totalDebit += l.debit;
      totalCredit += l.credit;
      return {
        id: randomUUID(),
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
        referenceType: l.referenceType ?? null,
        referenceId: l.referenceId ?? null,
      };
    });
    if (Math.abs(totalDebit - totalCredit) > 0.0000001) throw new UnbalancedJournalEntryError(totalDebit, totalCredit);

    const now = new Date();
    return new JournalEntry(randomUUID(), {
      entryNumber: null,
      entryDate: input.entryDate ?? now,
      description: input.description ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      branchId: input.branchId ?? null,
      status: "POSTED", // القيود الآلية (من الأحداث التشغيلية) بتتسجل POSTED مباشرة - نفس فلسفة الريبو القديم
      lines,
      createdBy: input.createdBy ?? null,
      postedAt: now,
      reversedAt: null,
      reversalOfEntryId: null,
      reversalReason: null,
      createdAt: now,
    });
  }

  static reconstitute(id: string, props: JournalEntryProps): JournalEntry {
    return new JournalEntry(id, props);
  }

  assignEntryNumber(entryNumber: string): void {
    this.props.entryNumber = entryNumber;
  }

  // بيرجع قيد عكسي جديد (كل سطر بمقلوب مدين/دائن) - القيد الأصلي مايتلمسش خالص، بيفضل POSTED وموجود
  // للأبد بس معلّم إنه اترجع منه قيد عكسي (نفس فلسفة الريبو القديم - "التصحيح الوحيد المسموح: قيد عكسي")
  reverse(input: { reversedBy?: string | null; reason?: string | null }): JournalEntry {
    if (this.props.status === "REVERSED") throw new JournalEntryAlreadyReversedError();
    if (this.props.status !== "POSTED") throw new JournalEntryNotPostedError();

    const now = new Date();
    const reversalLines = this.props.lines.map((l) => ({
      id: randomUUID(),
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      description: l.description,
      referenceType: l.referenceType,
      referenceId: l.referenceId,
    }));

    this.props.status = "REVERSED";
    this.props.reversedAt = now;

    return new JournalEntry(randomUUID(), {
      entryNumber: null,
      entryDate: now,
      description: `عكس القيد ${this.props.entryNumber ?? this.id}${input.reason ? ` - ${input.reason}` : ""}`,
      sourceType: "reversal",
      sourceId: this.id,
      branchId: this.props.branchId,
      status: "POSTED",
      lines: reversalLines,
      createdBy: input.reversedBy ?? null,
      postedAt: now,
      reversedAt: null,
      reversalOfEntryId: this.id,
      reversalReason: input.reason ?? null,
      createdAt: now,
    });
  }

  get entryNumber(): string | null { return this.props.entryNumber; }
  get entryDate(): Date { return this.props.entryDate; }
  get description(): string | null { return this.props.description; }
  get sourceType(): string { return this.props.sourceType; }
  get sourceId(): string | null { return this.props.sourceId; }
  get branchId(): string | null { return this.props.branchId; }
  get status(): JournalEntryStatus { return this.props.status; }
  get lines(): readonly JournalEntryLine[] { return this.props.lines; }
  get createdBy(): string | null { return this.props.createdBy; }
  get postedAt(): Date | null { return this.props.postedAt; }
  get reversedAt(): Date | null { return this.props.reversedAt; }
  get reversalOfEntryId(): string | null { return this.props.reversalOfEntryId; }
  get reversalReason(): string | null { return this.props.reversalReason; }
  get createdAt(): Date { return this.props.createdAt; }
}
