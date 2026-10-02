import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { OrderRegisteredEvent } from "../../../orders/domain/events/order-registered.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// كود حسابات "الكاش" و"مبيعات الطعام" - نفس أكواد دليل الحسابات الفعلي في الريبو القديم بالظبط
// (1100/4100، راجع legacy accounts table)، مش أكواد افتراضية اختراعية - عشان القيد يترحّل فعليًا على
// نفس الحسابات اللي هيستوردها سكريبت استيراد دليل الحسابات. لو الحسابين دول مش موجودين لسه (النظام لسه
// معملوش استيراد دليل الحسابات)، بيتسجل تحذير والقيد بيتخطّى - مش بيوقف تسجيل الطلب نفسه أبدًا (فشل
// subscriber مايأثرش على الناشر - راجع EventBusService.publish)
const CASH_ACCOUNT_CODE = "1100";
const SALES_REVENUE_ACCOUNT_CODE = "4100";

@Injectable()
export class PostOrderSaleJournalEntryHandler {
  private readonly logger = new Logger(PostOrderSaleJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly posting: AccountingPostingService
  ) {}

  async handle(event: OrderRegisteredEvent, opts?: { entryDate?: Date }): Promise<void> {
    if (event.total <= 0) return;

    const acc = await this.posting.requireAccounts([CASH_ACCOUNT_CODE, SALES_REVENUE_ACCOUNT_CODE], "order_sale", event.orderId);
    if (!acc) return;
    const cashAccount = acc[CASH_ACCOUNT_CODE];
    const salesAccount = acc[SALES_REVENUE_ACCOUNT_CODE];

    const entry = JournalEntry.register({
      entryDate: opts?.entryDate,
      sourceType: "order_sale",
      sourceId: event.orderId,
      branchId: event.branchId,
      description: `قيد بيع تلقائي للطلب ${event.orderId}`,
      lines: [
        { accountId: cashAccount.id, debit: event.total, credit: 0 },
        { accountId: salesAccount.id, debit: 0, credit: event.total },
      ],
      createdBy: event.createdBy,
    });
    await this.posting.postOnce(entry);
  }
}
