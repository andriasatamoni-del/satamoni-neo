import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { AccountingPeriod, type PeriodStatus } from "../../domain/accounting-period.aggregate";
import type { AccountingPeriodRepositoryPort } from "../../domain/ports/accounting-period-repository.port";
import type { AccountingPeriodsTable } from "./accounting.schema";

@Injectable()
export class KyselyAccountingPeriodRepository implements AccountingPeriodRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(period: AccountingPeriod): Promise<void> {
    await this.db
      .insertInto("accounting_periods")
      .values({
        id: period.id,
        year: period.year,
        month: period.month,
        status: period.status,
        closed_by: period.closedBy,
        closed_at: period.closedAt,
      })
      .onConflict((oc) =>
        oc.columns(["year", "month"]).doUpdateSet({
          status: period.status,
          closed_by: period.closedBy,
          closed_at: period.closedAt,
        })
      )
      .execute();
  }

  async findByYearMonth(year: number, month: number): Promise<AccountingPeriod | null> {
    const row = await this.db
      .selectFrom("accounting_periods")
      .selectAll()
      .where("year", "=", year)
      .where("month", "=", month)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { year?: number }): Promise<AccountingPeriod[]> {
    let query = this.db.selectFrom("accounting_periods").selectAll();
    if (filter?.year) query = query.where("year", "=", filter.year);
    const rows = await query.orderBy("year", "desc").orderBy("month", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<AccountingPeriodsTable>): AccountingPeriod {
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
