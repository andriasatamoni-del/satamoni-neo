import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { journalEntries, journalEntryLines } from "../../../accounting/infrastructure/persistence/accounting.tables";
import type { TreasuryBalanceReaderPort } from "../../domain/ports/treasury-balance-reader.port";

@Injectable()
export class TreasuryBalanceReader implements TreasuryBalanceReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getBalances(accountIds: string[]): Promise<Map<string, number>> {
    const balances = new Map<string, number>(accountIds.map((id) => [id, 0]));
    if (accountIds.length === 0) return balances;

    // <> DRAFT مش = POSTED: قيد REVERSED فعليًا لسه بيمثّل جزء حقيقي من الدفتر (مايتحذفش ومايتلمسش)،
    // وقيد العكس الجديد (POSTED) هو اللي بيلغي أثره - لو استبعدنا REVERSED هنا هيبقى الإلغاء بيرحّل
    // التصحيح مرتين (إزالة الأصلي + إضافة عكسه) بدل مرة واحدة (اتلقّطت بالظبط كده في اختبار إلغاء فاتورة مورد)
    const rows = await this.db
      .select({ account_id: journalEntryLines.account_id, debit: journalEntryLines.debit, credit: journalEntryLines.credit })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .where(and(inArray(journalEntryLines.account_id, accountIds), ne(journalEntries.status, "DRAFT")));

    for (const row of rows) {
      const current = balances.get(row.account_id) ?? 0;
      balances.set(row.account_id, current + Number(row.debit) - Number(row.credit));
    }
    return balances;
  }
}
