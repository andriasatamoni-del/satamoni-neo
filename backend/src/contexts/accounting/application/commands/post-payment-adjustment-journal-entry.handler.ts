import { Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { PaymentAdjustmentApprovedEvent } from "../../../payment-control/domain/events/payment-adjustment-approved.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// BL-06 - accounting treatment of an approved payment AMOUNT adjustment (documented decision, no new policy invented):
//   * The sale (revenue 4100 / cash 1100 for the order total) and its journal are FACTS and are never edited or reversed.
//   * The adjustment corrects the CASH actually received. The correction uses the system's existing cash-variance convention
//     (account 6950, identical to shift and driver-settlement cash variances):
//         amount DECREASED by d:  Dr 6950 d  / Cr 1100 d   (less cash than the sale journal assumed)
//         amount INCREASED by d:  Dr 1100 d  / Cr 6950 d
//   * One correction journal per approved request (source "payment_adjustment", source id = request id); each covers the delta
//     between the payment amount BEFORE and AFTER that approval, so the sum of corrections always equals payment - order total.
//   * A METHOD-only change has no GL effect: every method maps to Cash 1100 (approved temporary decision); it is audited and the
//     order/payment records are kept consistent instead.
//   * No refund / cash-drawer / revenue-recognition rule is implied. If the accountant prefers a different account for these
//     differences it is a one-line change of CASH_VARIANCE_ACCOUNT_CODE.
export const CASH_ACCOUNT_CODE = "1100";
export const CASH_VARIANCE_ACCOUNT_CODE = "6950";

@Injectable()
export class PostPaymentAdjustmentJournalEntryHandler {
  constructor(private readonly posting: AccountingPostingService) {}

  async handle(event: PaymentAdjustmentApprovedEvent, opts?: { entryDate?: Date }): Promise<void> {
    const delta = Math.round((event.newAmount - event.previousAmount) * 100) / 100;
    if (Math.abs(delta) < 0.005) return;

    const acc = await this.posting.requireAccounts([CASH_ACCOUNT_CODE, CASH_VARIANCE_ACCOUNT_CODE], "payment_adjustment", event.requestId);
    if (!acc) return;

    const amount = Math.abs(delta);
    const increased = delta > 0;
    const entry = JournalEntry.register({
      sourceType: "payment_adjustment",
      sourceId: event.requestId,
      branchId: event.branchId,
      entryDate: opts?.entryDate,
      description: `تصحيح مبلغ دفعة بعد اعتماد تعديل - الطلب ${event.orderId} (من ${event.previousAmount} إلى ${event.newAmount})`,
      lines: increased
        ? [
            { accountId: acc[CASH_ACCOUNT_CODE].id, debit: amount, credit: 0, referenceType: "order", referenceId: event.orderId },
            { accountId: acc[CASH_VARIANCE_ACCOUNT_CODE].id, debit: 0, credit: amount, referenceType: "order", referenceId: event.orderId },
          ]
        : [
            { accountId: acc[CASH_VARIANCE_ACCOUNT_CODE].id, debit: amount, credit: 0, referenceType: "order", referenceId: event.orderId },
            { accountId: acc[CASH_ACCOUNT_CODE].id, debit: 0, credit: amount, referenceType: "order", referenceId: event.orderId },
          ],
      createdBy: event.approvedBy,
    });
    await this.posting.postOnce(entry);
  }
}
