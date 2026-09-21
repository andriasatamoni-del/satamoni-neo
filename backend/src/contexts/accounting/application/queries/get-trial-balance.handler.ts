import { Inject, Injectable } from "@nestjs/common";
import {
  ACCOUNTING_REPORTS_READER,
  type AccountingReportsReaderPort,
  type TrialBalanceResult,
} from "../../domain/ports/accounting-reports-reader.port";

@Injectable()
export class GetTrialBalanceHandler {
  constructor(@Inject(ACCOUNTING_REPORTS_READER) private readonly reports: AccountingReportsReaderPort) {}

  execute(asOf: Date, branchId?: string | null): Promise<TrialBalanceResult> {
    return this.reports.trialBalance(asOf, branchId);
  }
}
