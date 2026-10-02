import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { DriverSettlementCreatedEvent } from "../../../delivery/domain/events/driver-settlement-created.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// نفس فلسفة post-shift-variance-journal-entry.handler.ts بالحرف - أكواد حقيقية من دليل الحسابات
// (1100 الكاش، 6950 فروق كاش، نفس الكود المستخدم لفروق شيفت الكاشير). فرق موجب (السائق سلّم أكتر من
// المتوقع) بيزود الكاش ويقفل كمصروف سالب؛ فرق سالب (عجز) بيقلل الكاش ويترحّل كمصروف
const CASH_ACCOUNT_CODE = "1100";
const VARIANCE_ACCOUNT_CODE = "6950";

@Injectable()
export class PostDriverSettlementVarianceJournalEntryHandler {
  private readonly logger = new Logger(PostDriverSettlementVarianceJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly posting: AccountingPostingService
  ) {}

  async handle(event: DriverSettlementCreatedEvent): Promise<void> {
    if (event.handoverVariance === 0) return;

    const acc = await this.posting.requireAccounts([CASH_ACCOUNT_CODE, VARIANCE_ACCOUNT_CODE], "driver_settlement", event.settlementId);
    if (!acc) return;
    const cashAccount = acc[CASH_ACCOUNT_CODE];
    const varianceAccount = acc[VARIANCE_ACCOUNT_CODE];

    const amount = Math.round(Math.abs(event.handoverVariance) * 100) / 100;
    const surplus = event.handoverVariance > 0;
    const entry = JournalEntry.register({
      sourceType: "driver_settlement",
      sourceId: event.settlementId,
      branchId: event.branchId,
      description: `فرق تسوية سائق #${event.settlementId} - ${surplus ? "زيادة" : "عجز"}`,
      lines: surplus
        ? [
            { accountId: cashAccount.id, debit: amount, credit: 0 },
            { accountId: varianceAccount.id, debit: 0, credit: amount },
          ]
        : [
            { accountId: varianceAccount.id, debit: amount, credit: 0 },
            { accountId: cashAccount.id, debit: 0, credit: amount },
          ],
      createdBy: event.settledBy,
    });
    await this.posting.postOnce(entry);
  }
}
