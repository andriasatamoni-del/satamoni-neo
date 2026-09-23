import { randomUUID } from "node:crypto";
import { AccountingPeriodAlreadyClosedError } from "./errors";

export const PERIOD_STATUSES = ["OPEN", "CLOSED"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface AccountingPeriodProps {
  year: number;
  month: number;
  status: PeriodStatus;
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

// AccountingPeriod - قفل شهري: بعد القفل، مفيش أي قيد جديد أو عكسي يترحّل عليه (متحقق منه بتريجر
// حقيقي في migration 035، مش هنا بس). شهر من غير صف هنا خالص = مفتوح ضمنيًا - نفس فلسفة الريبو القديم
// (ensurePeriodOpen بيسجّل الصف OPEN أول قيد يوصله لشهر جديد). التصحيحات بعد القفل بتتسجّل بقيد جديد
// في الشهر المفتوح الحالي، مش بإعادة فتح القديم - مفيش reopen() عمدًا.
export class AccountingPeriod {
  private constructor(
    public readonly id: string,
    private props: AccountingPeriodProps
  ) {}

  static openFor(year: number, month: number): AccountingPeriod {
    return new AccountingPeriod(randomUUID(), {
      year,
      month,
      status: "OPEN",
      closedBy: null,
      closedAt: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: AccountingPeriodProps): AccountingPeriod {
    return new AccountingPeriod(id, props);
  }

  close(closedBy?: string | null): void {
    if (this.props.status === "CLOSED") throw new AccountingPeriodAlreadyClosedError(this.props.year, this.props.month);
    this.props.status = "CLOSED";
    this.props.closedBy = closedBy ?? null;
    this.props.closedAt = new Date();
  }

  get year(): number { return this.props.year; }
  get month(): number { return this.props.month; }
  get status(): PeriodStatus { return this.props.status; }
  get closedBy(): string | null { return this.props.closedBy; }
  get closedAt(): Date | null { return this.props.closedAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
