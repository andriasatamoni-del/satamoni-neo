import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { BranchDayRedItem, BranchDayYellowItem } from "../../domain/branch-day-checklist";
import type {
  BranchDayChecklistReaderPort,
  BranchDayTodaySummary,
} from "../../domain/ports/branch-day-checklist-reader.port";
import { ListPendingSettlementDriversHandler } from "../../../delivery/application/queries/list-pending-settlement-drivers.handler";

const OPEN_ORDER_STATUSES = ["preparing", "out_for_delivery"] as const;

@Injectable()
export class KyselyBranchDayChecklistReader implements BranchDayChecklistReaderPort {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly listPendingSettlementDrivers: ListPendingSettlementDriversHandler
  ) {}

  async buildRedItems(branchId: string): Promise<BranchDayRedItem[]> {
    const items: BranchDayRedItem[] = [];

    const activeShifts = await this.db
      .selectFrom("cashier_shifts")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("branch_id", "=", branchId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirstOrThrow();
    if (Number(activeShifts.count) > 0) {
      items.push({ code: "ACTIVE_SHIFTS", message: `${activeShifts.count} شيفت لسه شغال - لازم يتقفل الأول` });
    }

    const pendingReviewShifts = await this.db
      .selectFrom("cashier_shifts")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("branch_id", "=", branchId)
      .where("status", "=", "PENDING_REVIEW")
      .executeTakeFirstOrThrow();
    if (Number(pendingReviewShifts.count) > 0) {
      items.push({
        code: "PENDING_REVIEW_SHIFTS",
        message: `${pendingReviewShifts.count} شيفت فيه فرق كاش لسه محتاج مراجعة مدير`,
      });
    }

    const openOrders = await this.db
      .selectFrom("orders")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("branch_id", "=", branchId)
      .where("status", "in", [...OPEN_ORDER_STATUSES])
      .executeTakeFirstOrThrow();
    if (Number(openOrders.count) > 0) {
      items.push({ code: "OPEN_ORDERS", message: `${openOrders.count} طلب لسه مفتوح (تحت التحضير أو في الطريق)` });
    }

    const pendingDrivers = (await this.listPendingSettlementDrivers.execute(branchId)).filter((d) => d.pendingCash > 0);
    if (pendingDrivers.length > 0) {
      const totalCash = pendingDrivers.reduce((s, d) => s + d.pendingCash, 0);
      items.push({
        code: "UNSETTLED_DRIVER_CASH",
        message: `${pendingDrivers.length} سائق لسه شايل كاش فرع متسواش (${totalCash.toFixed(2)} ج.م إجمالي) - لازم تحصيل مجمع الأول`,
      });
    }

    return items;
  }

  async buildYellowItems(branchId: string): Promise<BranchDayYellowItem[]> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reviewedWithVariance = await this.db
      .selectFrom("cashier_shifts")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("branch_id", "=", branchId)
      .where("status", "=", "CLOSED")
      .where("variance_status", "in", ["ACKNOWLEDGED", "APPROVED"])
      .where("closed_at", ">=", yesterday)
      .executeTakeFirstOrThrow();

    if (Number(reviewedWithVariance.count) > 0) {
      return [{ code: "REVIEWED_VARIANCE_TODAY", message: `${reviewedWithVariance.count} شيفت اتقفل بفرق كاش (اتراجع بالفعل) - للعلم بس` }];
    }
    return [];
  }

  async getSummaryForDate(branchId: string, businessDate: string): Promise<BranchDayTodaySummary> {
    const dayStart = new Date(`${businessDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${businessDate}T23:59:59.999Z`);
    const rows = await this.db
      .selectFrom("orders")
      .select(["total"])
      .where("branch_id", "=", branchId)
      .where("status", "<>", "cancelled")
      .where("created_at", ">=", dayStart)
      .where("created_at", "<=", dayEnd)
      .execute();

    return {
      totalSales: rows.reduce((sum, r) => sum + Number(r.total), 0),
      orderCount: rows.length,
    };
  }

  async getCashVarianceTotalForDate(branchId: string, businessDate: string): Promise<number> {
    const dayStart = new Date(`${businessDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${businessDate}T23:59:59.999Z`);
    const rows = await this.db
      .selectFrom("cashier_shifts")
      .select(["cash_variance"])
      .where("branch_id", "=", branchId)
      .where("status", "=", "CLOSED")
      .where("opened_at", ">=", dayStart)
      .where("opened_at", "<=", dayEnd)
      .execute();

    return rows.reduce((sum, r) => sum + Number(r.cash_variance ?? 0), 0);
  }
}
