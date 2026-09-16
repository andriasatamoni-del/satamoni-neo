import { Injectable, Logger, Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { PayrollRunApprovedEvent } from "../../../hr-payroll/domain/events/payroll-run-approved.event";

// كود حسابات "الرواتب" (مصروف) و"رواتب مستحقة" (التزام) - نفس أكواد دليل الحسابات الفعلي في الريبو
// القديم بالظبط (6100/2400)، نفس فلسفة post-order-sale-journal-entry.handler.ts بالحرف
const SALARIES_EXPENSE_ACCOUNT_CODE = "6100";
const SALARIES_PAYABLE_ACCOUNT_CODE = "2400";

@Injectable()
export class PostPayrollJournalEntryHandler {
  private readonly logger = new Logger(PostPayrollJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: PayrollRunApprovedEvent): Promise<void> {
    if (event.totalNetPay <= 0) return;

    const expenseAccount = await this.accounts.findByCode(SALARIES_EXPENSE_ACCOUNT_CODE);
    const payableAccount = await this.accounts.findByCode(SALARIES_PAYABLE_ACCOUNT_CODE);
    if (!expenseAccount || !payableAccount) {
      this.logger.warn(
        `تخطّي ترحيل قيد رواتب لقائمة ${event.payrollRunId} - دليل الحسابات لسه مش معدّ (${SALARIES_EXPENSE_ACCOUNT_CODE}/${SALARIES_PAYABLE_ACCOUNT_CODE})`
      );
      return;
    }

    const entry = JournalEntry.register({
      sourceType: "payroll_run",
      sourceId: event.payrollRunId,
      description: `قيد رواتب تلقائي لشهر ${event.month}/${event.year}`,
      lines: [
        { accountId: expenseAccount.id, debit: event.totalNetPay, credit: 0 },
        { accountId: payableAccount.id, debit: 0, credit: event.totalNetPay },
      ],
      createdBy: event.approvedBy,
    });
    await this.entries.save(entry);
  }
}
