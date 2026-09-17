import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { StocktakeCommittedEvent } from "../../../inventory/domain/events/stocktake-committed.event";

// نفس فلسفة post-goods-receipt-ap-journal-entry.handler.ts - أكواد حقيقية من دليل الحسابات (1400
// المخزون). قيد مستقل لكل سطر (مش قيد مجمّع للجلسة كلها) - نفس الريبو القديم بالظبط، عشان كل سطر يحمل
// مرجعه الخاص (sourceId = حركة المخزون بتاعته). زيادة الجرد (الفعلي أكتر من النظام) بتزوّد المخزون
// وتقفل كإيراد/تخفيض مصروف (دائن حساب التحميل)؛ عجز الجرد بيقلّل المخزون ويترحّل كمصروف (مدين حساب التحميل)
const INVENTORY_ACCOUNT_CODE = "1400";

@Injectable()
export class PostStocktakeVarianceJournalEntryHandler {
  private readonly logger = new Logger(PostStocktakeVarianceJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: StocktakeCommittedEvent): Promise<void> {
    const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
    if (!inventoryAccount) {
      this.logger.warn(`تخطّي ترحيل فروق جرد ${event.stocktakeId} - دليل الحسابات لسه مش معدّ (${INVENTORY_ACCOUNT_CODE})`);
      return;
    }

    for (const line of event.lines) {
      const chargeAccount = await this.accounts.findByCode(line.chargeAccountCode);
      if (!chargeAccount) {
        this.logger.warn(`تخطّي ترحيل فرق سطر جرد (حركة ${line.inventoryMovementId}) - الحساب ${line.chargeAccountCode} لسه مش معدّ`);
        continue;
      }

      const amount = Math.round(Math.abs(line.varianceValue) * 100) / 100;
      const isIncrease = line.varianceQuantity > 0;
      const entry = JournalEntry.register({
        sourceType: "stock_count",
        sourceId: line.inventoryMovementId,
        branchId: event.branchId,
        description: `فرق جرد فعلي #${event.stocktakeId}`,
        lines: isIncrease
          ? [
              { accountId: inventoryAccount.id, debit: amount, credit: 0 },
              { accountId: chargeAccount.id, debit: 0, credit: amount },
            ]
          : [
              { accountId: chargeAccount.id, debit: amount, credit: 0 },
              { accountId: inventoryAccount.id, debit: 0, credit: amount },
            ],
        createdBy: event.createdBy,
      });
      await this.entries.save(entry);
    }
  }
}
