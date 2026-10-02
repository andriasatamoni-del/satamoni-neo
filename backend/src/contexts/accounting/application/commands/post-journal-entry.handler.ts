import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import { JournalEntryNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface PostJournalEntryCommand {
  entryId: string;
  postedBy?: string | null;
}

// ترحيل قيد يدوي DRAFT -> POSTED - مراجعة صريحة قبل الترحيل (راجع تعليق JournalEntry.post())
@Injectable()
export class PostJournalEntryHandler {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: PostJournalEntryCommand): Promise<JournalEntry> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("journal_entries", command.entryId))) throw new JournalEntryNotFoundError();
      const entry = await this.entries.findById(command.entryId);
      if (!entry) throw new JournalEntryNotFoundError();
      auditDetail({ entityType: "journal_entries", entityId: entry.id, before: { status: entry.status, entryNumber: entry.entryNumber } });

      entry.post({ postedBy: command.postedBy });
      await this.entries.postEntry(entry.id, entry.postedAt!, entry.postedBy);
      auditDetail({ after: { status: entry.status } });
      return entry;
    });
  }
}
