import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryListFilter,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListJournalEntriesHandler {
  constructor(@Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort) {}

  async execute(filter: JournalEntryListFilter = {}, page?: PageRequest): Promise<{ entries: JournalEntry[]; total: number }> {
    return this.entries.search(filter, page);
  }
}
