import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { AccountingPeriod, type PeriodStatus } from "../../domain/accounting-period.aggregate";
import type { AccountingPeriodRepositoryPort } from "../../domain/ports/accounting-period-repository.port";
import { accountingPeriods } from "./accounting.tables";

@Injectable()
export class AccountingPeriodRepository implements AccountingPeriodRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(period: AccountingPeriod): Promise<void> {
    await this.db
      .insert(accountingPeriods)
      .values({
        id: period.id,
        year: period.year,
        month: period.month,
        status: period.status,
        closed_by: period.closedBy,
        closed_at: period.closedAt,
      })
      .onConflictDoUpdate({
        target: [accountingPeriods.year, accountingPeriods.month],
        set: { status: period.status, closed_by: period.closedBy, closed_at: period.closedAt },
      });
  }

  async findByYearMonth(year: number, month: number): Promise<AccountingPeriod | null> {
    const [row] = await this.db
      .select()
      .from(accountingPeriods)
      .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { year?: number }): Promise<AccountingPeriod[]> {
    const rows = await this.db
      .select()
      .from(accountingPeriods)
      .where(filter?.year ? eq(accountingPeriods.year, filter.year) : undefined)
      .orderBy(desc(accountingPeriods.year), desc(accountingPeriods.month));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof accountingPeriods.$inferSelect): AccountingPeriod {
    return AccountingPeriod.reconstitute(row.id, {
      year: row.year,
      month: row.month,
      status: row.status as PeriodStatus,
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    });
  }
}
