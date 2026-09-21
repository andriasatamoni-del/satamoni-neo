import { Inject, Injectable } from "@nestjs/common";
import { AccountNotFoundError } from "../../domain/errors";
import {
  ACCOUNTING_REPORTS_READER,
  type AccountingReportsReaderPort,
  type GeneralLedgerResult,
} from "../../domain/ports/accounting-reports-reader.port";

@Injectable()
export class GetGeneralLedgerHandler {
  constructor(@Inject(ACCOUNTING_REPORTS_READER) private readonly reports: AccountingReportsReaderPort) {}

  async execute(accountId: string, from: Date, to: Date): Promise<GeneralLedgerResult> {
    const result = await this.reports.generalLedger(accountId, from, to);
    if (!result) throw new AccountNotFoundError();
    return result;
  }
}
