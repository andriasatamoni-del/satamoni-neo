import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { CashDrawerEntryRegisteredEvent } from "../../../shifts/domain/events/cash-drawer-entry-registered.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// نفس فلسفة post-order-sale-journal-entry.handler.ts - كود حساب الكاش 1100 (زي أي قيد كاش تاني في
// النظام)، والحساب المدين بيتغيّر حسب النوع: مصروف تشغيلي عام (6900) أو مشترى بيدخل المخزون (1400) -
// نفس كودي legacy الفعليين لنفس المفهومين بالظبط (expenses.account_id fallback و purchases.category
// في db/shift-engine.js). درج الكاشير نفسه اتمثّل كـCashierShift مش كحساب خزينة منفصل (راجع تعليق
// Treasury.aggregate)، فالقيد هنا بيرحّل مباشرة على 1100 زي أي بيع تاني، مش على حساب فرعي لكل كاشير.
const CASH_ACCOUNT_CODE = "1100";
const EXPENSE_ACCOUNT_CODE = "6900";
const PURCHASE_INVENTORY_ACCOUNT_CODE = "1400";

@Injectable()
export class PostCashDrawerEntryJournalEntryHandler {
  private readonly logger = new Logger(PostCashDrawerEntryJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly posting: AccountingPostingService
  ) {}

  async handle(event: CashDrawerEntryRegisteredEvent): Promise<void> {
    if (event.amount <= 0) return;

    const debitCode = event.entryType === "EXPENSE" ? EXPENSE_ACCOUNT_CODE : PURCHASE_INVENTORY_ACCOUNT_CODE;
    const acc = await this.posting.requireAccounts([CASH_ACCOUNT_CODE, debitCode], "cash_drawer_entry", event.entryId);
    if (!acc) return;
    const cashAccount = acc[CASH_ACCOUNT_CODE];
    const debitAccount = acc[debitCode];

    const entry = JournalEntry.register({
      sourceType: "cash_drawer_entry",
      sourceId: event.entryId,
      branchId: event.branchId,
      description: `${event.entryType === "EXPENSE" ? "مصروف" : "مشترى"} درج شيفت #${event.shiftId}: ${event.label}`,
      lines: [
        { accountId: debitAccount.id, debit: event.amount, credit: 0 },
        { accountId: cashAccount.id, debit: 0, credit: event.amount },
      ],
      createdBy: event.createdBy,
    });
    await this.posting.postOnce(entry);
  }
}
