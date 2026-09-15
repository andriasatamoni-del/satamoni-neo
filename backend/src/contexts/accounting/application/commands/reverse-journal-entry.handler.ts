import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import { JournalEntryNotFoundError } from "../../domain/errors";

export interface ReverseJournalEntryCommand {
  entryId: string;
  reversedBy?: string | null;
  reason?: string | null;
}

@Injectable()
export class ReverseJournalEntryHandler {
  constructor(@Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort) {}

  async execute(command: ReverseJournalEntryCommand): Promise<JournalEntry> {
    const original = await this.entries.findById(command.entryId);
    if (!original) throw new JournalEntryNotFoundError();

    const reversal = original.reverse({ reversedBy: command.reversedBy, reason: command.reason });
    await this.entries.markReversed(original.id, original.reversedAt!);
    await this.entries.save(reversal);
    return reversal;
  }
}
