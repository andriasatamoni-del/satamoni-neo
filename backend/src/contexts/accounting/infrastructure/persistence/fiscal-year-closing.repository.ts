import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { FiscalYearClosing } from "../../domain/fiscal-year-closing.aggregate";
import type { FiscalYearClosingRepositoryPort } from "../../domain/ports/fiscal-year-closing-repository.port";
import { fiscalYearClosings } from "./accounting.tables";

@Injectable()
export class FiscalYearClosingRepository implements FiscalYearClosingRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(closing: FiscalYearClosing): Promise<void> {
    await this.db.insert(fiscalYearClosings).values({
      id: closing.id,
      year: closing.year,
      net_income: closing.netIncome,
      closed_by: closing.closedBy,
      closed_at: closing.closedAt,
      journal_entry_id: closing.journalEntryId,
    });
  }

  async findByYear(year: number): Promise<FiscalYearClosing | null> {
    const [row] = await this.db.select().from(fiscalYearClosings).where(eq(fiscalYearClosings.year, year)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<FiscalYearClosing[]> {
    const rows = await this.db.select().from(fiscalYearClosings).orderBy(desc(fiscalYearClosings.year));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof fiscalYearClosings.$inferSelect): FiscalYearClosing {
    return FiscalYearClosing.reconstitute(row.id, {
      year: row.year,
      netIncome: Number(row.net_income),
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      journalEntryId: row.journal_entry_id,
    });
  }
}
