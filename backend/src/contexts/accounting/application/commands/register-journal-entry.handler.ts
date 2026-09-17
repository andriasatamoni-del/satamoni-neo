import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import {
  JOURNAL_ENTRY_REPOSITORY,
  type JournalEntryRepositoryPort,
} from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { AccountNotFoundError } from "../../domain/errors";

export interface RegisterJournalEntryCommand {
  entryDate?: Date;
  description?: string | null;
  sourceType: string;
  sourceId?: string | null;
  branchId?: string | null;
  lines: {
    accountId: string;
    debit: number;
    credit: number;
    description?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
  }[];
  createdBy?: string | null;
}

@Injectable()
export class RegisterJournalEntryHandler {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async execute(command: RegisterJournalEntryCommand): Promise<JournalEntry> {
    for (const line of command.lines) {
      if (!(await this.accounts.findById(line.accountId))) throw new AccountNotFoundError();
    }

    const entry = JournalEntry.register(command);
    await this.entries.save(entry);
    return entry;
  }
}
