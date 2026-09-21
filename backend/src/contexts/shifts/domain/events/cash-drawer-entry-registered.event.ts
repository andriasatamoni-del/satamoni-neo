import { DomainEvent } from "../../../../shared/events/domain-event";
import type { CashDrawerEntryType } from "../cash-drawer-entry.aggregate";

// بينشر لما مصروف/مشترى نقدي يتسجل من درج شيفت شغال - مستهلك حالي: Accounting (يرحّل قيد مصروف/مشترى
// تلقائي مقابل حساب الكاش 1100، نفس فلسفة PostOrderSaleJournalEntryHandler بالظبط)
export class CashDrawerEntryRegisteredEvent extends DomainEvent {
  readonly eventName = "CashDrawerEntryRegistered";

  constructor(
    public readonly entryId: string,
    public readonly shiftId: string,
    public readonly branchId: string,
    public readonly entryType: CashDrawerEntryType,
    public readonly amount: number,
    public readonly label: string,
    public readonly createdBy: string
  ) {
    super();
  }
}
