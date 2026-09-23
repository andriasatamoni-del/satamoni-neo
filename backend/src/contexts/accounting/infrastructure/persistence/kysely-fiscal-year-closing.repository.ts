import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { FiscalYearClosing } from "../../domain/fiscal-year-closing.aggregate";
import type { FiscalYearClosingRepositoryPort } from "../../domain/ports/fiscal-year-closing-repository.port";
import type { FiscalYearClosingsTable } from "./accounting.schema";

@Injectable()
export class KyselyFiscalYearClosingRepository implements FiscalYearClosingRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(closing: FiscalYearClosing): Promise<void> {
    await this.db
      .insertInto("fiscal_year_closings")
      .values({
        id: closing.id,
        year: closing.year,
        net_income: closing.netIncome,
        closed_by: closing.closedBy,
        closed_at: closing.closedAt,
        journal_entry_id: closing.journalEntryId,
      })
      .execute();
  }

  async findByYear(year: number): Promise<FiscalYearClosing | null> {
    const row = await this.db.selectFrom("fiscal_year_closings").selectAll().where("year", "=", year).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<FiscalYearClosing[]> {
    const rows = await this.db.selectFrom("fiscal_year_closings").selectAll().orderBy("year", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<FiscalYearClosingsTable>): FiscalYearClosing {
    return FiscalYearClosing.reconstitute(row.id, {
      year: row.year,
      netIncome: Number(row.net_income),
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      journalEntryId: row.journal_entry_id,
    });
  }
}
