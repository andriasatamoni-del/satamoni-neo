import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { BranchDay } from "../../domain/branch-day.aggregate";
import { BranchDayAlreadyClosedError } from "../../domain/errors";
import type { BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";
import type { BranchDaysTable } from "./branch-day.schema";

@Injectable()
export class KyselyBranchDayRepository implements BranchDayRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(branchDay: BranchDay): Promise<void> {
    try {
      await this.db
        .insertInto("branch_days")
        .values({
          id: branchDay.id,
          branch_id: branchDay.branchId,
          business_date: branchDay.businessDate,
          closed_by: branchDay.closedBy,
          closed_at: branchDay.closedAt,
          total_sales: branchDay.totalSales,
          order_count: branchDay.orderCount,
          cash_variance_total: branchDay.cashVarianceTotal,
          manager_notes: branchDay.managerNotes,
        })
        .execute();
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new BranchDayAlreadyClosedError();
      throw err;
    }
  }

  async findByBranchAndDate(branchId: string, businessDate: string): Promise<BranchDay | null> {
    const row = await this.db
      .selectFrom("branch_days")
      .selectAll()
      .where("branch_id", "=", branchId)
      .where("business_date", "=", businessDate)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(branchId: string): Promise<BranchDay[]> {
    const rows = await this.db
      .selectFrom("branch_days")
      .selectAll()
      .where("branch_id", "=", branchId)
      .orderBy("business_date", "desc")
      .limit(90)
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<BranchDaysTable>): BranchDay {
    return BranchDay.reconstitute(row.id, {
      branchId: row.branch_id,
      businessDate: String(row.business_date),
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      totalSales: Number(row.total_sales),
      orderCount: row.order_count,
      cashVarianceTotal: Number(row.cash_variance_total),
      managerNotes: row.manager_notes,
    });
  }
}
