import { Inject, Injectable, Logger } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import type { Account } from "../../domain/account.aggregate";
import type { JournalEntry } from "../../domain/journal-entry.aggregate";
import { AccountingNotConfiguredError } from "../../domain/errors";

// Phase 3.1 (BL-08). Central policy for every automatic journal posting.
//
// ACCOUNTING_ENFORCEMENT=strict (default, REQUIRED for production)
//   A financial command whose required accounts are missing is REJECTED (HTTP 503 AccountingNotConfigured) and rolled back,
//   because the posting subscribers run inside the command's transaction. No order/payment/stock effect survives without
//   its journal.
// ACCOUNTING_ENFORCEMENT=deferred
//   Explicit operational choice (also used by legacy tests): the business command succeeds, the posting is NOT silently
//   forgotten - it shows up in the journal-coverage report / Action Center alert and can be reposted with the repair
//   operation once the chart of accounts is fixed.
export type AccountingEnforcement = "strict" | "deferred";

export function accountingEnforcement(): AccountingEnforcement {
  return process.env.ACCOUNTING_ENFORCEMENT === "deferred" ? "deferred" : "strict";
}

export type ReversalOutcome = "reversed" | "already_reversed" | "nothing_to_reverse";

@Injectable()
export class AccountingPostingService {
  private readonly logger = new Logger(AccountingPostingService.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  // Returns the accounts by code, or null (deferred mode only) when some are missing. Strict mode throws.
  async requireAccounts(codes: string[], flow: string, reference: string): Promise<Record<string, Account> | null> {
    const found: Record<string, Account> = {};
    const missing: string[] = [];
    for (const code of codes) {
      const account = await this.accounts.findByCode(code);
      if (account) found[code] = account;
      else missing.push(code);
    }
    if (missing.length === 0) return found;
    if (accountingEnforcement() === "strict") throw new AccountingNotConfiguredError(missing, flow);
    this.logger.warn(`DEFERRED posting for ${flow} ${reference}: chart of accounts lacks ${missing.join("/")} - will appear in the journal coverage report`);
    return null;
  }

  // Idempotent: at most one journal per (sourceType, sourceId). Returns false when the transaction was already posted.
  async postOnce(entry: JournalEntry): Promise<boolean> {
    if (entry.sourceId) {
      const existing = await this.entries.findBySource(entry.sourceType, entry.sourceId);
      if (existing.length > 0) return false;
    }
    await this.entries.save(entry);
    return true;
  }

  // Reverses the POSTED journal of a business transaction (original is marked REVERSED, a mirror entry is posted).
  async reverseBySource(
    sourceType: string,
    sourceId: string,
    by: string | null,
    reason: string
  ): Promise<ReversalOutcome> {
    const found = await this.entries.findBySource(sourceType, sourceId);
    const posted = found.find((e) => e.status === "POSTED");
    if (!posted) return found.some((e) => e.status === "REVERSED") ? "already_reversed" : "nothing_to_reverse";
    const reversal = posted.reverse({ reversedBy: by, reason });
    await this.entries.markReversed(posted.id, posted.reversedAt!);
    await this.entries.save(reversal);
    return "reversed";
  }
}
