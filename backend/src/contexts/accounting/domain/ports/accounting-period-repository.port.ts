import type { AccountingPeriod } from "../accounting-period.aggregate";

export interface AccountingPeriodRepositoryPort {
  save(period: AccountingPeriod): Promise<void>;
  findByYearMonth(year: number, month: number): Promise<AccountingPeriod | null>;
  list(filter?: { year?: number }): Promise<AccountingPeriod[]>;
}

export const ACCOUNTING_PERIOD_REPOSITORY = Symbol("ACCOUNTING_PERIOD_REPOSITORY");
