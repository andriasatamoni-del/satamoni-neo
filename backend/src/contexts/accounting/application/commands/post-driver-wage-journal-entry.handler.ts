import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { DriverAttendanceShiftClosedEvent } from "../../../delivery/domain/events/driver-attendance-shift-closed.event";

// أجر + بونص السائق بيتدفع كاش على طول وقت قفل الشيفت (مش عن طريق pipeline مراجعة مصروفات منفصل زي
// الريبو القديم expenses.status='SUBMITTED' - مفيش Expense context لسه في المشروع ده، تبسيط متعمّد).
// كود 6900 "مصروفات تشغيل أخرى" مُعاد استخدامه (نفس فلسفة كل الـhandlers التانية - أكواد حقيقية من
// دليل الحسابات، مفيش كود مخصص لأجور السائقين لسه في الشجرة الافتراضية)
const CASH_ACCOUNT_CODE = "1100";
const OTHER_OPERATING_EXPENSE_ACCOUNT_CODE = "6900";

@Injectable()
export class PostDriverWageJournalEntryHandler {
  private readonly logger = new Logger(PostDriverWageJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: DriverAttendanceShiftClosedEvent): Promise<void> {
    if (event.totalPay <= 0) return;

    const expenseAccount = await this.accounts.findByCode(OTHER_OPERATING_EXPENSE_ACCOUNT_CODE);
    const cashAccount = await this.accounts.findByCode(CASH_ACCOUNT_CODE);
    if (!expenseAccount || !cashAccount) {
      this.logger.warn(`تخطّي ترحيل قيد أجر شيفت السائق ${event.shiftId} - دليل الحسابات لسه مش معدّ`);
      return;
    }

    const entry = JournalEntry.register({
      sourceType: "driver_attendance_shift",
      sourceId: event.shiftId,
      branchId: event.branchId,
      description: `أجر + بونص شيفت سائق #${event.shiftId}`,
      lines: [
        { accountId: expenseAccount.id, debit: event.totalPay, credit: 0 },
        { accountId: cashAccount.id, debit: 0, credit: event.totalPay },
      ],
      createdBy: event.closedBy,
    });
    await this.entries.save(entry);
  }
}
