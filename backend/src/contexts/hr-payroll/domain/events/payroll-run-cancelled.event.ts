import { DomainEvent } from "../../../../shared/events/domain-event";

// BL-10: an APPROVED payroll run was cancelled - Accounting must reverse the payroll journal it posted at approval.
export class PayrollRunCancelledEvent extends DomainEvent {
  readonly eventName = "PayrollRunCancelled";

  constructor(
    public readonly payrollRunId: string,
    public readonly year: number,
    public readonly month: number,
    public readonly totalNetPay: number,
    public readonly cancelledBy: string | null,
    public readonly reason: string | null
  ) {
    super();
  }
}
