import { Injectable, Logger, Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { PayrollRunApprovedEvent } from "../../../hr-payroll/domain/events/payroll-run-approved.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// كود حسابات "الرواتب" (مصروف) و"رواتب مستحقة" (التزام) - نفس أكواد دليل الحسابات الفعلي في الريبو
// القديم بالظبط (6100/2400)، نفس فلسفة post-order-sale-journal-entry.handler.ts بالحرف
const SALARIES_EXPENSE_ACCOUNT_CODE = "6100";
const SALARIES_PAYABLE_ACCOUNT_CODE = "2400";

@Injectable()
export class PostPayrollJournalEntryHandler {
  private readonly logger = new Logger(PostPayrollJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly posting: AccountingPostingService
  ) {}

  async handle(event: PayrollRunApprovedEvent, opts?: { entryDate?: Date }): Promise<void> {
    if (event.totalNetPay <= 0) return;

    const acc = await this.posting.requireAccounts([SALARIES_EXPENSE_ACCOUNT_CODE, SALARIES_PAYABLE_ACCOUNT_CODE], "payroll_run", event.payrollRunId);
    if (!acc) return;
    const expenseAccount = acc[SALARIES_EXPENSE_ACCOUNT_CODE];
    const payableAccount = acc[SALARIES_PAYABLE_ACCOUNT_CODE];

    const entry = JournalEntry.register({
      entryDate: opts?.entryDate,
      sourceType: "payroll_run",
      sourceId: event.payrollRunId,
      description: `قيد رواتب تلقائي لشهر ${event.month}/${event.year}`,
      lines: [
        { accountId: expenseAccount.id, debit: event.totalNetPay, credit: 0 },
        { accountId: payableAccount.id, debit: 0, credit: event.totalNetPay },
      ],
      createdBy: event.approvedBy,
    });
    await this.posting.postOnce(entry);
  }
}
