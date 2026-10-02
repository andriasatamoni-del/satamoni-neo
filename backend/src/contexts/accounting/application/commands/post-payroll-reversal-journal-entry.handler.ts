import { Injectable, Logger } from "@nestjs/common";
import type { PayrollRunCancelledEvent } from "../../../hr-payroll/domain/events/payroll-run-cancelled.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// BL-10: cancelling an approved payroll reverses its journal (Dr 2400 / Cr 6100 mirror of the approval entry). The original
// payroll entry and its history are preserved (marked REVERSED); the reversal is a new balanced POSTED entry.
@Injectable()
export class PostPayrollReversalJournalEntryHandler {
  private readonly logger = new Logger(PostPayrollReversalJournalEntryHandler.name);

  constructor(private readonly posting: AccountingPostingService) {}

  async handle(event: PayrollRunCancelledEvent): Promise<void> {
    const outcome = await this.posting.reverseBySource(
      "payroll_run",
      event.payrollRunId,
      event.cancelledBy,
      `إلغاء قائمة رواتب ${event.month}/${event.year}${event.reason ? ` - ${event.reason}` : ""}`
    );
    if (outcome === "nothing_to_reverse" && event.totalNetPay > 0) {
      this.logger.warn(`cancellation of payroll run ${event.payrollRunId}: it had no posted payroll journal to reverse`);
    }
  }
}
