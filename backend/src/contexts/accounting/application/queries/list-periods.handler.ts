import { Inject, Injectable } from "@nestjs/common";
import { AccountingPeriod } from "../../domain/accounting-period.aggregate";
import {
  ACCOUNTING_PERIOD_REPOSITORY,
  type AccountingPeriodRepositoryPort,
} from "../../domain/ports/accounting-period-repository.port";

@Injectable()
export class ListPeriodsHandler {
  constructor(@Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly periods: AccountingPeriodRepositoryPort) {}

  execute(filter?: { year?: number }): Promise<AccountingPeriod[]> {
    return this.periods.list(filter);
  }
}
