import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { BranchDayRedItem, BranchDayYellowItem } from "../../domain/branch-day-checklist";
import type {
  BranchDayChecklistReaderPort,
  BranchDayTodaySummary,
} from "../../domain/ports/branch-day-checklist-reader.port";
import { ListPendingSettlementDriversHandler } from "../../../delivery/application/queries/list-pending-settlement-drivers.handler";
import { businessDayStartUtc, businessDayEndUtc } from "../../../../shared/time/business-date";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { cashierShifts } from "../../../shifts/infrastructure/persistence/shifts.tables";

const OPEN_ORDER_STATUSES = ["preparing", "out_for_delivery"] as const;

@Injectable()
export class BranchDayChecklistReader implements BranchDayChecklistReaderPort {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly listPendingSettlementDrivers: ListPendingSettlementDriversHandler
  ) {}

  async buildRedItems(branchId: string): Promise<BranchDayRedItem[]> {
    const items: BranchDayRedItem[] = [];

    const [activeShifts] = await this.db
      .select({ count: count() })
      .from(cashierShifts)
      .where(and(eq(cashierShifts.branch_id, branchId), eq(cashierShifts.status, "ACTIVE")));
    if (Number(activeShifts.count) > 0) {
      items.push({ code: "ACTIVE_SHIFTS", message: `${activeShifts.count} شيفت لسه شغال - لازم يتقفل الأول` });
    }

    const [pendingReviewShifts] = await this.db
      .select({ count: count() })
      .from(cashierShifts)
      .where(and(eq(cashierShifts.branch_id, branchId), eq(cashierShifts.status, "PENDING_REVIEW")));
    if (Number(pendingReviewShifts.count) > 0) {
      items.push({
        code: "PENDING_REVIEW_SHIFTS",
        message: `${pendingReviewShifts.count} شيفت فيه فرق كاش لسه محتاج مراجعة مدير`,
      });
    }

    const [openOrders] = await this.db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.branch_id, branchId), inArray(orders.status, [...OPEN_ORDER_STATUSES])));
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
    const [reviewedWithVariance] = await this.db
      .select({ count: count() })
      .from(cashierShifts)
      .where(
        and(
          eq(cashierShifts.branch_id, branchId),
          eq(cashierShifts.status, "CLOSED"),
          inArray(cashierShifts.variance_status, ["ACKNOWLEDGED", "APPROVED"]),
          gte(cashierShifts.closed_at, yesterday)
        )
      );

    if (Number(reviewedWithVariance.count) > 0) {
      return [{ code: "REVIEWED_VARIANCE_TODAY", message: `${reviewedWithVariance.count} شيفت اتقفل بفرق كاش (اتراجع بالفعل) - للعلم بس` }];
    }
    return [];
  }

  async getSummaryForDate(branchId: string, businessDate: string): Promise<BranchDayTodaySummary> {
    const dayStart = businessDayStartUtc(businessDate);
    const dayEnd = businessDayEndUtc(businessDate);
    const rows = await this.db
      .select({ total: orders.total })
      .from(orders)
      .where(and(eq(orders.branch_id, branchId), ne(orders.status, "cancelled"), gte(orders.created_at, dayStart), lte(orders.created_at, dayEnd)));

    return {
      totalSales: rows.reduce((sum, r) => sum + Number(r.total), 0),
      orderCount: rows.length,
    };
  }

  async getCashVarianceTotalForDate(branchId: string, businessDate: string): Promise<number> {
    const dayStart = businessDayStartUtc(businessDate);
    const dayEnd = businessDayEndUtc(businessDate);
    const rows = await this.db
      .select({ cash_variance: cashierShifts.cash_variance })
      .from(cashierShifts)
      .where(
        and(
          eq(cashierShifts.branch_id, branchId),
          eq(cashierShifts.status, "CLOSED"),
          gte(cashierShifts.opened_at, dayStart),
          lte(cashierShifts.opened_at, dayEnd)
        )
      );

    return rows.reduce((sum, r) => sum + Number(r.cash_variance ?? 0), 0);
  }
}
