import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import { JournalEntryNotFoundError } from "../../domain/errors";

export interface PostJournalEntryCommand {
  entryId: string;
  postedBy?: string | null;
}

// ترحيل قيد يدوي DRAFT -> POSTED - مراجعة صريحة قبل الترحيل (راجع تعليق JournalEntry.post())
@Injectable()
export class PostJournalEntryHandler {
  constructor(@Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort) {}

  async execute(command: PostJournalEntryCommand): Promise<JournalEntry> {
    const entry = await this.entries.findById(command.entryId);
    if (!entry) throw new JournalEntryNotFoundError();

    entry.post({ postedBy: command.postedBy });
    await this.entries.postEntry(entry.id, entry.postedAt!, entry.postedBy);
    return entry;
  }
}
