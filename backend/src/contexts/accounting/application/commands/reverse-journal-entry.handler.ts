import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import { JournalEntryNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface ReverseJournalEntryCommand {
  entryId: string;
  reversedBy?: string | null;
  reason?: string | null;
}

@Injectable()
export class ReverseJournalEntryHandler {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: ReverseJournalEntryCommand): Promise<JournalEntry> {
    // marking the original REVERSED and writing the mirror entry are ONE atomic step; the row lock makes a double reversal impossible
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("journal_entries", command.entryId))) throw new JournalEntryNotFoundError();
      const original = await this.entries.findById(command.entryId);
      if (!original) throw new JournalEntryNotFoundError();
      auditDetail({ entityType: "journal_entries", entityId: original.id, before: { status: original.status, entryNumber: original.entryNumber }, reason: command.reason ?? null });

      const reversal = original.reverse({ reversedBy: command.reversedBy, reason: command.reason });
      await this.entries.markReversed(original.id, original.reversedAt!);
      await this.entries.save(reversal);
      auditDetail({ after: { status: original.status, reversalEntryId: reversal.id } });
      return reversal;
    });
  }
}
