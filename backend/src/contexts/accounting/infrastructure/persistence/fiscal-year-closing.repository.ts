import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
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
    return (await this.listPage()).rows;
  }

  async listPage(page?: PageRequest): Promise<{ rows: FiscalYearClosing[]; total: number }> {
    const query = this.db.select().from(fiscalYearClosings).orderBy(desc(fiscalYearClosings.year), desc(fiscalYearClosings.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(fiscalYearClosings)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
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
