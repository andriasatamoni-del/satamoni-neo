import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { AccountType } from "../../domain/account.aggregate";
import { computeAccountBalance, isCreditNormalAccount } from "../../domain/accounting-reports";
import type {
  AccountingReportsReaderPort,
  GeneralLedgerResult,
  IncomeStatementLine,
  IncomeStatementResult,
  TrialBalanceResult,
  TrialBalanceRow,
} from "../../domain/ports/accounting-reports-reader.port";
import { accounts, journalEntries, journalEntryLines } from "./accounting.tables";

// a REVERSED original stays in the ledger and its (POSTED) mirror entry cancels it - excluding REVERSED would count the reversal twice
const IN_LEDGER = inArray(journalEntries.status, ["POSTED", "REVERSED"]);

@Injectable()
export class AccountingReportsReader implements AccountingReportsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async trialBalance(asOf: Date, branchId?: string | null): Promise<TrialBalanceResult> {
    const lines = await this.db
      .select({ account_id: journalEntryLines.account_id, debit: journalEntryLines.debit, credit: journalEntryLines.credit })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .where(and(IN_LEDGER, lte(journalEntries.entry_date, asOf), branchId ? eq(journalEntries.branch_id, branchId) : undefined));

    const sumsByAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of lines) {
      const entry = sumsByAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
      entry.debit += Number(l.debit);
      entry.credit += Number(l.credit);
      sumsByAccount.set(l.account_id, entry);
    }

    const accountIds = [...sumsByAccount.keys()];
    const accountRows = accountIds.length > 0 ? await this.db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];

    const rows: TrialBalanceRow[] = accountRows
      .map((a) => {
        const sums = sumsByAccount.get(a.id)!;
        const accountType = a.account_type as AccountType;
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          accountType,
          totalDebit: sums.debit,
          totalCredit: sums.credit,
          balance: computeAccountBalance(accountType, sums.debit, sums.credit),
        };
      })
      .sort((x, y) => x.code.localeCompare(y.code));

    return {
      asOf: asOf.toISOString().slice(0, 10),
      branchId: branchId ?? null,
      rows,
      totalDebit: rows.reduce((s, r) => s + r.totalDebit, 0),
      totalCredit: rows.reduce((s, r) => s + r.totalCredit, 0),
    };
  }

  async generalLedger(accountId: string, from: Date, to: Date): Promise<GeneralLedgerResult | null> {
    const [accountRow] = await this.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!accountRow) return null;
    const accountType = accountRow.account_type as AccountType;

    const openingRows = await this.db
      .select({ debit: journalEntryLines.debit, credit: journalEntryLines.credit })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .where(and(eq(journalEntryLines.account_id, accountId), IN_LEDGER, lt(journalEntries.entry_date, from)));
    const openingDebit = openingRows.reduce((s, r) => s + Number(r.debit), 0);
    const openingCredit = openingRows.reduce((s, r) => s + Number(r.credit), 0);
    const openingBalance = computeAccountBalance(accountType, openingDebit, openingCredit);

    const lineRows = await this.db
      .select({
        journal_entry_id: journalEntries.id,
        entry_number: journalEntries.entry_number,
        entry_date: journalEntries.entry_date,
        entry_description: journalEntries.description,
        line_id: journalEntryLines.id,
        line_description: journalEntryLines.description,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .where(
        and(
          eq(journalEntryLines.account_id, accountId),
          IN_LEDGER,
          gte(journalEntries.entry_date, from),
          lte(journalEntries.entry_date, to)
        )
      )
      .orderBy(asc(journalEntries.entry_date), asc(journalEntries.id), asc(journalEntryLines.id));

    const creditNormal = isCreditNormalAccount(accountType);
    let running = openingBalance;
    const lines = lineRows.map((r) => {
      const debit = Number(r.debit);
      const credit = Number(r.credit);
      running += creditNormal ? credit - debit : debit - credit;
      return {
        journalEntryId: r.journal_entry_id,
        entryNumber: r.entry_number,
        entryDate: r.entry_date.toISOString().slice(0, 10),
        description: r.line_description ?? r.entry_description,
        debit,
        credit,
        runningBalance: running,
      };
    });

    return {
      account: { id: accountRow.id, code: accountRow.code, name: accountRow.name, accountType },
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      openingBalance,
      lines,
      closingBalance: running,
    };
  }

  async incomeStatement(from: Date, to: Date, branchId?: string | null): Promise<IncomeStatementResult> {
    const rows = await this.db
      .select({
        account_id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        account_type: accounts.account_type,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .innerJoin(accounts, eq(accounts.id, journalEntryLines.account_id))
      .where(
        and(
          IN_LEDGER,
          gte(journalEntries.entry_date, from),
          lte(journalEntries.entry_date, to),
          inArray(accounts.account_type, ["REVENUE", "COGS", "EXPENSE"]),
          branchId ? eq(journalEntries.branch_id, branchId) : undefined
        )
      );

    const byAccount = new Map<string, { code: string; name: string; accountType: AccountType; debit: number; credit: number }>();
    for (const r of rows) {
      const entry = byAccount.get(r.account_id) ?? { code: r.code, name: r.name, accountType: r.account_type as AccountType, debit: 0, credit: 0 };
      entry.debit += Number(r.debit);
      entry.credit += Number(r.credit);
      byAccount.set(r.account_id, entry);
    }

    const revenueLines: IncomeStatementLine[] = [];
    const cogsLines: IncomeStatementLine[] = [];
    const expenseLines: IncomeStatementLine[] = [];
    for (const [accountId, a] of byAccount) {
      const amount = computeAccountBalance(a.accountType, a.debit, a.credit);
      if (amount === 0) continue;
      const line: IncomeStatementLine = { accountId, code: a.code, name: a.name, amount };
      if (a.accountType === "REVENUE") revenueLines.push(line);
      else if (a.accountType === "COGS") cogsLines.push(line);
      else expenseLines.push(line);
    }
    const byAmountDesc = (x: IncomeStatementLine, y: IncomeStatementLine) => y.amount - x.amount;
    revenueLines.sort(byAmountDesc);
    cogsLines.sort(byAmountDesc);
    expenseLines.sort(byAmountDesc);

    const revenue = revenueLines.reduce((s, l) => s + l.amount, 0);
    const cogs = cogsLines.reduce((s, l) => s + l.amount, 0);
    const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0);
    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - totalExpenses;

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      branchId: branchId ?? null,
      revenueLines,
      revenue,
      cogsLines,
      cogs,
      grossProfit,
      expenseLines,
      totalExpenses,
      netIncome,
    };
  }
}
