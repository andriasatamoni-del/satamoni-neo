import { Inject, Injectable } from "@nestjs/common";
import { AccountingPeriod } from "../../domain/accounting-period.aggregate";
import {
  ACCOUNTING_PERIOD_REPOSITORY,
  type AccountingPeriodRepositoryPort,
} from "../../domain/ports/accounting-period-repository.port";

export interface ClosePeriodCommand {
  year: number;
  month: number;
  closedBy?: string | null;
}

// بعد القفل، مفيش أي قيد جديد أو عكسي يترحّل على الشهر ده (متحقق منه في KyselyJournalEntryRepository.save()
// + تريجر القاعدة، مش هنا) - التصحيحات لازم تتسجل في الشهر المفتوح الحالي بقيد واضح السبب
@Injectable()
export class ClosePeriodHandler {
  constructor(@Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly periods: AccountingPeriodRepositoryPort) {}

  async execute(command: ClosePeriodCommand): Promise<AccountingPeriod> {
    const period = (await this.periods.findByYearMonth(command.year, command.month)) ?? AccountingPeriod.openFor(command.year, command.month);
    period.close(command.closedBy);
    await this.periods.save(period);
    return period;
  }
}
