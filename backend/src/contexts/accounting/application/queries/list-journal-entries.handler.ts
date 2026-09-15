import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";

@Injectable()
export class ListJournalEntriesHandler {
  constructor(@Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort) {}

  async execute(filter?: { branchId?: string; sourceType?: string }): Promise<JournalEntry[]> {
    return this.entries.list(filter);
  }
}
