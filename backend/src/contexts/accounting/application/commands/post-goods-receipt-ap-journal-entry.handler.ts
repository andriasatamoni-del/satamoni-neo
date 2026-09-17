import { Inject, Injectable, Logger } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { GoodsReceiptConfirmedEvent } from "../../../procurement/domain/events/goods-receipt-confirmed.event";

// نفس أكواد المخزون/الحسابات الدائنة الفعلية في الريبو القديم بالظبط (1400/2100، راجع
// routes/supplier-invoices.js وsupplier-payments.js)
const INVENTORY_ACCOUNT_CODE = "1400";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";

// استلام بضاعة من غير مورد محدد (مشترى الكاشير الطارئ، PO-less) مالوش قيد AP خالص - نفس فلسفة الريبو
// القديم بالظبط (فاتورة المورد هي اللي بتربط الاستلام بمورد فعليًا، مش الاستلام نفسه في الحالة دي)
@Injectable()
export class PostGoodsReceiptApJournalEntryHandler {
  private readonly logger = new Logger(PostGoodsReceiptApJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: GoodsReceiptConfirmedEvent): Promise<void> {
    if (!event.supplierId || event.totalValue <= 0) return;

    const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
    const apAccount = await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE);
    if (!inventoryAccount || !apAccount) {
      this.logger.warn(`تخطّي ترحيل قيد AP لاستلام ${event.goodsReceiptId} - دليل الحسابات لسه مش معدّ (${INVENTORY_ACCOUNT_CODE}/${ACCOUNTS_PAYABLE_ACCOUNT_CODE})`);
      return;
    }

    const entry = JournalEntry.register({
      sourceType: "goods_receipt",
      sourceId: event.goodsReceiptId,
      branchId: event.branchId,
      description: `قيد استلام بضاعة تلقائي #${event.goodsReceiptId}`,
      lines: [
        { accountId: inventoryAccount.id, debit: event.totalValue, credit: 0 },
        { accountId: apAccount.id, debit: 0, credit: event.totalValue, referenceType: "supplier", referenceId: event.supplierId },
      ],
      createdBy: event.confirmedBy,
    });
    await this.entries.save(entry);
  }
}
