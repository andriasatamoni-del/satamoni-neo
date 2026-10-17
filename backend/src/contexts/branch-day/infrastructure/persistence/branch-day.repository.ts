import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import { pgErrorCode } from "../../../../shared/database/transaction-context";
import { BranchDay } from "../../domain/branch-day.aggregate";
import { BranchDayAlreadyClosedError } from "../../domain/errors";
import type { BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";
import { branchDays } from "./branch-day.tables";

@Injectable()
export class BranchDayRepository implements BranchDayRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(branchDay: BranchDay): Promise<void> {
    try {
      await this.db.insert(branchDays).values({
        id: branchDay.id,
        branch_id: branchDay.branchId,
        business_date: branchDay.businessDate,
        closed_by: branchDay.closedBy,
        closed_at: branchDay.closedAt,
        total_sales: branchDay.totalSales,
        order_count: branchDay.orderCount,
        cash_variance_total: branchDay.cashVarianceTotal,
        manager_notes: branchDay.managerNotes,
      });
    } catch (err) {
      if (pgErrorCode(err) === "23505") throw new BranchDayAlreadyClosedError();
      throw err;
    }
  }

  async findByBranchAndDate(branchId: string, businessDate: string): Promise<BranchDay | null> {
    const [row] = await this.db
      .select()
      .from(branchDays)
      .where(and(eq(branchDays.branch_id, branchId), eq(branchDays.business_date, businessDate)))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(branchId: string, page: PageRequest): Promise<{ days: BranchDay[]; total: number }> {
    const where = eq(branchDays.branch_id, branchId);
    const query = this.db.select().from(branchDays).where(where).orderBy(desc(branchDays.business_date), desc(branchDays.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(branchDays).where(where)));
    return { days: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof branchDays.$inferSelect): BranchDay {
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
