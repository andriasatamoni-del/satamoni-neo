import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { ShiftClosedEvent } from "../../../shifts/domain/events/shift-closed.event";

// نفس فلسفة post-order-sale-journal-entry.handler.ts - أكواد حقيقية من دليل الحسابات المستورد
// (1100 الكاش، 6950 فروق كاش - نفس كود الريبو القديم بالظبط). فرق موجب (كاش فعلي أكتر من المتوقع)
// بيزود رصيد الكاش ويقفل كمصروف سالب (دائن 6950)؛ فرق سالب (عجز) بيقلل الكاش ويترحّل كمصروف (مدين 6950).
// تسليم الدرج لحساب خزينة منفصل بالكاشير، وربط العجز بسلفة موظف حقيقية في الرواتب - مؤجّلين (راجع
// تعليق migration 013_create_cashier_shifts_table.ts)
const CASH_ACCOUNT_CODE = "1100";
const VARIANCE_ACCOUNT_CODE = "6950";

@Injectable()
export class PostShiftVarianceJournalEntryHandler {
  private readonly logger = new Logger(PostShiftVarianceJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: ShiftClosedEvent): Promise<void> {
    if (event.cashVariance === 0) return;

    const cashAccount = await this.accounts.findByCode(CASH_ACCOUNT_CODE);
    const varianceAccount = await this.accounts.findByCode(VARIANCE_ACCOUNT_CODE);
    if (!cashAccount || !varianceAccount) {
      this.logger.warn(`تخطّي ترحيل فرق كاش الشيفت ${event.shiftId} - دليل الحسابات لسه مش معدّ`);
      return;
    }

    const amount = Math.round(Math.abs(event.cashVariance) * 100) / 100;
    const surplus = event.cashVariance > 0;
    const entry = JournalEntry.register({
      sourceType: "shift_variance",
      sourceId: event.shiftId,
      branchId: event.branchId,
      description: `فرق كاش شيفت #${event.shiftId} - ${surplus ? "زيادة" : "عجز"}`,
      lines: surplus
        ? [
            { accountId: cashAccount.id, debit: amount, credit: 0 },
            { accountId: varianceAccount.id, debit: 0, credit: amount },
          ]
        : [
            { accountId: varianceAccount.id, debit: amount, credit: 0 },
            { accountId: cashAccount.id, debit: 0, credit: amount },
          ],
      createdBy: event.closedBy,
    });
    await this.entries.save(entry);
  }
}
