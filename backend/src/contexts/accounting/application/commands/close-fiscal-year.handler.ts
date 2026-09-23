import { Inject, Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import { FiscalYearClosing } from "../../domain/fiscal-year-closing.aggregate";
import {
  FISCAL_YEAR_CLOSING_REPOSITORY,
  type FiscalYearClosingRepositoryPort,
} from "../../domain/ports/fiscal-year-closing-repository.port";
import {
  ACCOUNTING_PERIOD_REPOSITORY,
  type AccountingPeriodRepositoryPort,
} from "../../domain/ports/accounting-period-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import {
  ACCOUNTING_REPORTS_READER,
  type AccountingReportsReaderPort,
  type IncomeStatementLine,
} from "../../domain/ports/accounting-reports-reader.port";
import {
  FiscalYearAlreadyClosedError,
  FiscalYearMonthsNotAllClosedError,
  NoActivityToCloseError,
  RetainedEarningsAccountNotFoundError,
} from "../../domain/errors";

export interface CloseFiscalYearCommand {
  year: number;
  closedBy?: string | null;
}

// نفس كود حساب "الأرباح المرحّلة" في دليل الحسابات الافتراضي بالريبو القديم بالظبط (3200، EQUITY) -
// سكريبت استيراد دليل الحسابات بيستورد نفس الكود، مش كود مُخترع هنا
const RETAINED_EARNINGS_ACCOUNT_CODE = "3200";

function buildClosingLine(line: IncomeStatementLine, isRevenue: boolean, year: number) {
  const description = `إقفال ${line.name} - سنة ${year}`;
  // revenue: amount = credit-debit (جانبها الطبيعي دائن) -> لتصفيرها: مدين لو موجبة، دائن لو سالبة (حالة نادرة)
  // cogs/expense: amount = debit-credit (جانبها الطبيعي مدين) -> لتصفيرها: دائن لو موجبة، مدين لو سالبة
  if (isRevenue) {
    return line.amount > 0
      ? { accountId: line.accountId, debit: line.amount, credit: 0, description }
      : { accountId: line.accountId, debit: 0, credit: -line.amount, description };
  }
  return line.amount > 0
    ? { accountId: line.accountId, debit: 0, credit: line.amount, description }
    : { accountId: line.accountId, debit: -line.amount, credit: 0, description };
}

// قفل سنة مالية - بيتطلب كل شهور السنة CLOSED في accounting_periods الأول، بيحسب صافي الربح (كل
// حسابات REVENUE/COGS/EXPENSE المتحركة في السنة، عن طريق نفس قارئ تقرير الدخل الموجود بالفعل - مش
// استعلام SQL مكرر) وبيقفلها بقيد واحد يصفّر كل حساب من دول على الأرباح المرحّلة. القيد بيتسجل بتاريخ
// أول يوم في السنة الجاية (مش آخر يوم في السنة المقفولة) عشان ديسمبر المقفول أصلًا هيرفض أي قيد جديد
// عليه - نفس فلسفة الريبو القديم بالحرف. غير قابل للعكس بـendpoint مخصّص عمدًا (مفيش reopen) - تصحيح
// نادر جدًا (قفل غلط) يقدر يستخدم reverse() العام على القيد نفسه، مش الطريق المتوقع.
@Injectable()
export class CloseFiscalYearHandler {
  constructor(
    @Inject(FISCAL_YEAR_CLOSING_REPOSITORY) private readonly closings: FiscalYearClosingRepositoryPort,
    @Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly periods: AccountingPeriodRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNTING_REPORTS_READER) private readonly reports: AccountingReportsReaderPort
  ) {}

  async execute(command: CloseFiscalYearCommand): Promise<FiscalYearClosing> {
    const { year } = command;
    if (await this.closings.findByYear(year)) throw new FiscalYearAlreadyClosedError(year);

    const periodsOfYear = await this.periods.list({ year });
    const closedMonths = new Set(periodsOfYear.filter((p) => p.status === "CLOSED").map((p) => p.month));
    const missingMonths: number[] = [];
    for (let m = 1; m <= 12; m++) if (!closedMonths.has(m)) missingMonths.push(m);
    if (missingMonths.length > 0) throw new FiscalYearMonthsNotAllClosedError(year, missingMonths);

    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const statement = await this.reports.incomeStatement(from, to);

    const closingLines = [
      ...statement.revenueLines.map((l) => buildClosingLine(l, true, year)),
      ...statement.cogsLines.map((l) => buildClosingLine(l, false, year)),
      ...statement.expenseLines.map((l) => buildClosingLine(l, false, year)),
    ];
    if (closingLines.length === 0) throw new NoActivityToCloseError(year);

    const netIncome = statement.netIncome;
    if (netIncome !== 0) {
      const retainedEarnings = await this.accounts.findByCode(RETAINED_EARNINGS_ACCOUNT_CODE);
      if (!retainedEarnings) throw new RetainedEarningsAccountNotFoundError(RETAINED_EARNINGS_ACCOUNT_CODE);
      const description = netIncome > 0 ? `صافي ربح سنة ${year} → أرباح مرحّلة` : `صافي خسارة سنة ${year} → أرباح مرحّلة`;
      closingLines.push(
        netIncome > 0
          ? { accountId: retainedEarnings.id, debit: 0, credit: netIncome, description }
          : { accountId: retainedEarnings.id, debit: -netIncome, credit: 0, description }
      );
    }

    const entry = JournalEntry.register({
      entryDate: new Date(Date.UTC(year + 1, 0, 1)),
      description: `قيد إقفال سنة مالية ${year}`,
      sourceType: "year_end_closing",
      sourceId: String(year),
      lines: closingLines,
      createdBy: command.closedBy,
    });
    await this.entries.save(entry);

    const closing = FiscalYearClosing.register({ year, netIncome, closedBy: command.closedBy, journalEntryId: entry.id });
    await this.closings.save(closing);
    return closing;
  }
}
