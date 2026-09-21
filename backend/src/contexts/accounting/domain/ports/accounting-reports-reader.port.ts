import type { AccountType } from "../account.aggregate";

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  accountType: AccountType;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface TrialBalanceResult {
  asOf: string;
  branchId: string | null;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

export interface GeneralLedgerLine {
  journalEntryId: string;
  entryNumber: string | null;
  entryDate: string;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GeneralLedgerResult {
  account: { id: string; code: string; name: string; accountType: AccountType };
  from: string;
  to: string;
  openingBalance: number;
  lines: GeneralLedgerLine[];
  closingBalance: number;
}

export interface IncomeStatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatementResult {
  from: string;
  to: string;
  branchId: string | null;
  revenueLines: IncomeStatementLine[];
  revenue: number;
  cogsLines: IncomeStatementLine[];
  cogs: number;
  grossProfit: number;
  expenseLines: IncomeStatementLine[];
  totalExpenses: number;
  netIncome: number;
}

export interface AccountingReportsReaderPort {
  trialBalance(asOf: Date, branchId?: string | null): Promise<TrialBalanceResult>;
  generalLedger(accountId: string, from: Date, to: Date): Promise<GeneralLedgerResult | null>;
  incomeStatement(from: Date, to: Date, branchId?: string | null): Promise<IncomeStatementResult>;
}

export const ACCOUNTING_REPORTS_READER = Symbol("ACCOUNTING_REPORTS_READER");
