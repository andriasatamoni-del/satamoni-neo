import { Inject, Injectable, Logger } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { PurchaseConfirmedEvent } from "../../../purchases/domain/events/purchase-confirmed.event";

const INVENTORY_ACCOUNT_CODE = "1400";
const CASH_ACCOUNT_CODE = "1100";

// المشترى الطارئ (PO-less) دايمًا نقدي محاسبيًا بغض النظر عن أي مورد مرتبط بيه - راجع تعليق
// purchase.aggregate.ts. مختلف عمدًا عن PostGoodsReceiptApJournalEntryHandler اللي بيرحّل على حساب
// دائن (2100) - المشترى ده مسار تاني تمامًا، نفس فصل الريبو القديم بين routes/purchases.js
// وroutes/goods-receipts.js بالحرف
@Injectable()
export class PostPurchaseJournalEntryHandler {
  private readonly logger = new Logger(PostPurchaseJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: PurchaseConfirmedEvent): Promise<void> {
    if (event.totalValue <= 0) return;

    const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
    const cashAccount = await this.accounts.findByCode(CASH_ACCOUNT_CODE);
    if (!inventoryAccount || !cashAccount) {
      this.logger.warn(`تخطّي ترحيل قيد مشترى ${event.purchaseId} - دليل الحسابات لسه مش معدّ (${INVENTORY_ACCOUNT_CODE}/${CASH_ACCOUNT_CODE})`);
      return;
    }

    const entry = JournalEntry.register({
      sourceType: "purchase",
      sourceId: event.purchaseId,
      branchId: event.branchId,
      description: `مشترى نقدي - فاتورة #${event.purchaseId}`,
      lines: [
        { accountId: inventoryAccount.id, debit: event.totalValue, credit: 0 },
        { accountId: cashAccount.id, debit: 0, credit: event.totalValue },
      ],
      createdBy: event.confirmedBy,
    });
    await this.entries.save(entry);
  }
}
