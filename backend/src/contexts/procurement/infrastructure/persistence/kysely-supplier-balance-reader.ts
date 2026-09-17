import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { SupplierBalanceReaderPort } from "../../domain/ports/supplier-balance-reader.port";

@Injectable()
export class KyselySupplierBalanceReader implements SupplierBalanceReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getBalance(supplierId: string): Promise<number> {
    const rows = await this.db
      .selectFrom("journal_entry_lines")
      .innerJoin("journal_entries", "journal_entries.id", "journal_entry_lines.journal_entry_id")
      .select(["journal_entry_lines.debit as debit", "journal_entry_lines.credit as credit"])
      .where("journal_entry_lines.reference_type", "=", "supplier")
      .where("journal_entry_lines.reference_id", "=", supplierId)
      // <> DRAFT مش = POSTED: قيد REVERSED فعليًا لسه بيمثّل جزء حقيقي من الدفتر (مايتحذفش
      // ومايتلمسش)، وقيد العكس الجديد (POSTED) هو اللي بيلغي أثره - لو استبعدنا REVERSED هنا
      // هيبقى الإلغاء بيرحّل التصحيح مرتين (إزالة الأصلي + إضافة عكسه) بدل مرة واحدة
      .where("journal_entries.status", "<>", "DRAFT")
      .execute();

    let balance = 0;
    for (const row of rows) balance += Number(row.credit) - Number(row.debit);
    return balance;
  }
}
