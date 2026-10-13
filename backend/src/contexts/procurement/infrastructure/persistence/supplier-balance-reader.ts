import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { journalEntries, journalEntryLines } from "../../../accounting/infrastructure/persistence/accounting.tables";
import type { SupplierBalanceReaderPort } from "../../domain/ports/supplier-balance-reader.port";

@Injectable()
export class SupplierBalanceReader implements SupplierBalanceReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getBalance(supplierId: string): Promise<number> {
    const rows = await this.db
      .select({ debit: journalEntryLines.debit, credit: journalEntryLines.credit })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
      .where(
        and(
          eq(journalEntryLines.reference_type, "supplier"),
          eq(journalEntryLines.reference_id, supplierId),
          // <> DRAFT مش = POSTED: قيد REVERSED فعليًا لسه بيمثّل جزء حقيقي من الدفتر (مايتحذفش
          // ومايتلمسش)، وقيد العكس الجديد (POSTED) هو اللي بيلغي أثره - لو استبعدنا REVERSED هنا
          // هيبقى الإلغاء بيرحّل التصحيح مرتين (إزالة الأصلي + إضافة عكسه) بدل مرة واحدة
          ne(journalEntries.status, "DRAFT")
        )
      );

    let balance = 0;
    for (const row of rows) balance += Number(row.credit) - Number(row.debit);
    return balance;
  }
}
