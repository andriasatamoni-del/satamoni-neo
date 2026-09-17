import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { TreasuryBalanceReaderPort } from "../../domain/ports/treasury-balance-reader.port";

@Injectable()
export class KyselyTreasuryBalanceReader implements TreasuryBalanceReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getBalances(accountIds: string[]): Promise<Map<string, number>> {
    const balances = new Map<string, number>(accountIds.map((id) => [id, 0]));
    if (accountIds.length === 0) return balances;

    // <> DRAFT مش = POSTED: قيد REVERSED فعليًا لسه بيمثّل جزء حقيقي من الدفتر (مايتحذفش ومايتلمسش)،
    // وقيد العكس الجديد (POSTED) هو اللي بيلغي أثره - لو استبعدنا REVERSED هنا هيبقى الإلغاء بيرحّل
    // التصحيح مرتين (إزالة الأصلي + إضافة عكسه) بدل مرة واحدة (اتلقّطت بالظبط كده في اختبار إلغاء فاتورة مورد)
    const rows = await this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .select(["journal_entry_lines.account_id as account_id", "journal_entry_lines.debit as debit", "journal_entry_lines.credit as credit"])
      .where("journal_entry_lines.account_id", "in", accountIds)
      .where("journal_entries.status", "<>", "DRAFT")
      .execute();

    for (const row of rows) {
      const current = balances.get(row.account_id) ?? 0;
      balances.set(row.account_id, current + Number(row.debit) - Number(row.credit));
    }
    return balances;
  }
}
