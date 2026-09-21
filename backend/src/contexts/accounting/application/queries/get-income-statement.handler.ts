import { Inject, Injectable } from "@nestjs/common";
import {
  ACCOUNTING_REPORTS_READER,
  type AccountingReportsReaderPort,
  type IncomeStatementResult,
} from "../../domain/ports/accounting-reports-reader.port";

@Injectable()
export class GetIncomeStatementHandler {
  constructor(@Inject(ACCOUNTING_REPORTS_READER) private readonly reports: AccountingReportsReaderPort) {}

  execute(from: Date, to: Date, branchId?: string | null): Promise<IncomeStatementResult> {
    return this.reports.incomeStatement(from, to, branchId);
  }
}
