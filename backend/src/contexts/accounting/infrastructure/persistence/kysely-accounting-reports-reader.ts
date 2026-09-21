import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
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

@Injectable()
export class KyselyAccountingReportsReader implements AccountingReportsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async trialBalance(asOf: Date, branchId?: string | null): Promise<TrialBalanceResult> {
    let query = this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .select(["journal_entry_lines.account_id as account_id", "journal_entry_lines.debit as debit", "journal_entry_lines.credit as credit"])
      .where("journal_entries.status", "=", "POSTED")
      .where("journal_entries.entry_date", "<=", asOf);
    if (branchId) query = query.where("journal_entries.branch_id", "=", branchId);
    const lines = await query.execute();

    const sumsByAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of lines) {
      const entry = sumsByAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
      entry.debit += Number(l.debit);
      entry.credit += Number(l.credit);
      sumsByAccount.set(l.account_id, entry);
    }

    const accountIds = [...sumsByAccount.keys()];
    const accounts = accountIds.length > 0
      ? await this.db.selectFrom("accounts").selectAll().where("id", "in", accountIds).execute()
      : [];

    const rows: TrialBalanceRow[] = accounts
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
    const accountRow = await this.db.selectFrom("accounts").selectAll().where("id", "=", accountId).executeTakeFirst();
    if (!accountRow) return null;
    const accountType = accountRow.account_type as AccountType;

    const openingRows = await this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .select(["journal_entry_lines.debit as debit", "journal_entry_lines.credit as credit"])
      .where("journal_entry_lines.account_id", "=", accountId)
      .where("journal_entries.status", "=", "POSTED")
      .where("journal_entries.entry_date", "<", from)
      .execute();
    const openingDebit = openingRows.reduce((s, r) => s + Number(r.debit), 0);
    const openingCredit = openingRows.reduce((s, r) => s + Number(r.credit), 0);
    const openingBalance = computeAccountBalance(accountType, openingDebit, openingCredit);

    const lineRows = await this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .select([
        "journal_entries.id as journal_entry_id",
        "journal_entries.entry_number as entry_number",
        "journal_entries.entry_date as entry_date",
        "journal_entries.description as entry_description",
        "journal_entry_lines.id as line_id",
        "journal_entry_lines.description as line_description",
        "journal_entry_lines.debit as debit",
        "journal_entry_lines.credit as credit",
      ])
      .where("journal_entry_lines.account_id", "=", accountId)
      .where("journal_entries.status", "=", "POSTED")
      .where("journal_entries.entry_date", ">=", from)
      .where("journal_entries.entry_date", "<=", to)
      .orderBy("journal_entries.entry_date")
      .orderBy("journal_entries.id")
      .orderBy("journal_entry_lines.id")
      .execute();

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
    let query = this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .innerJoin("accounts", "accounts.id", "journal_entry_lines.account_id")
      .select([
        "accounts.id as account_id",
        "accounts.code as code",
        "accounts.name as name",
        "accounts.account_type as account_type",
        "journal_entry_lines.debit as debit",
        "journal_entry_lines.credit as credit",
      ])
      .where("journal_entries.status", "=", "POSTED")
      .where("journal_entries.entry_date", ">=", from)
      .where("journal_entries.entry_date", "<=", to)
      .where("accounts.account_type", "in", ["REVENUE", "COGS", "EXPENSE"]);
    if (branchId) query = query.where("journal_entries.branch_id", "=", branchId);
    const rows = await query.execute();

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
