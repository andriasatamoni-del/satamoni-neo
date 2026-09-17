import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { DashboardSummary, DashboardSummaryReaderPort } from "../../domain/ports/dashboard-summary-reader.port";

@Injectable()
export class KyselyDashboardSummaryReader implements DashboardSummaryReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getSummary(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<DashboardSummary> {
    let orderQuery = this.db
      .selectFrom("orders")
      .select(["id", "branch_id", "status", "total", "created_at"])
      .where("created_at", ">=", input.fromTs)
      .where("created_at", "<=", input.toTs);
    if (input.branchId) orderQuery = orderQuery.where("branch_id", "=", input.branchId);
    const orders = await orderQuery.execute();

    const activeOrders = orders.filter((o) => o.status !== "cancelled");
    const revenue = activeOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = activeOrders.length;
    const cancelledCount = orders.length - orderCount;
    const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    const dailyMap = new Map<string, number>();
    for (const o of activeOrders) {
      const date = o.created_at.toISOString().slice(0, 10);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + Number(o.total));
    }
    const dailyTrend = [...dailyMap.entries()]
      .map(([date, rev]) => ({ date, revenue: rev }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const statusMap = new Map<string, number>();
    for (const o of orders) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
    const orderStatusBreakdown = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

    const branchMap = new Map<string, { revenue: number; orderCount: number }>();
    for (const o of activeOrders) {
      const entry = branchMap.get(o.branch_id) ?? { revenue: 0, orderCount: 0 };
      entry.revenue += Number(o.total);
      entry.orderCount += 1;
      branchMap.set(o.branch_id, entry);
    }
    const branchIds = [...branchMap.keys()];
    const branchRows = branchIds.length > 0
      ? await this.db.selectFrom("branches").select(["id", "name"]).where("id", "in", branchIds).execute()
      : [];
    const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));
    const revenueByBranch = branchIds
      .map((branchId) => ({
        branchId,
        name: branchNameById.get(branchId) ?? branchId,
        revenue: branchMap.get(branchId)!.revenue,
        orderCount: branchMap.get(branchId)!.orderCount,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const activeOrderIds = activeOrders.map((o) => o.id);
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    if (activeOrderIds.length > 0) {
      const itemRows = await this.db
        .selectFrom("order_items")
        .innerJoin("menu_items", "menu_items.id", "order_items.menu_item_id")
        .select(["order_items.menu_item_id as menu_item_id", "menu_items.name as name", "order_items.quantity as quantity", "order_items.line_total as line_total"])
        .where("order_items.order_id", "in", activeOrderIds)
        .execute();
      for (const row of itemRows) {
        const entry = itemMap.get(row.menu_item_id) ?? { name: row.name, quantity: 0, revenue: 0 };
        entry.quantity += row.quantity;
        entry.revenue += Number(row.line_total);
        itemMap.set(row.menu_item_id, entry);
      }
    }
    const topItemsByRevenue = [...itemMap.entries()]
      .map(([menuItemId, v]) => ({ menuItemId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    let paymentQuery = this.db
      .selectFrom("payments")
      .innerJoin("payment_methods", "payment_methods.id", "payments.payment_method_id")
      .select(["payments.payment_method_id as payment_method_id", "payment_methods.name as name", "payments.amount as amount"])
      .where("payments.locked_at", ">=", input.fromTs)
      .where("payments.locked_at", "<=", input.toTs);
    if (input.branchId) paymentQuery = paymentQuery.where("payments.branch_id", "=", input.branchId);
    const paymentRows = await paymentQuery.execute();
    const paymentMap = new Map<string, { name: string; amount: number }>();
    for (const row of paymentRows) {
      const entry = paymentMap.get(row.payment_method_id) ?? { name: row.name, amount: 0 };
      entry.amount += Number(row.amount);
      paymentMap.set(row.payment_method_id, entry);
    }
    const paymentMethodBreakdown = [...paymentMap.entries()]
      .map(([paymentMethodId, v]) => ({ paymentMethodId, ...v }))
      .sort((a, b) => b.amount - a.amount);

    return {
      from: input.fromTs.toISOString().slice(0, 10),
      to: input.toTs.toISOString().slice(0, 10),
      revenue,
      orderCount,
      cancelledCount,
      avgOrderValue,
      dailyTrend,
      topItemsByRevenue,
      revenueByBranch,
      orderStatusBreakdown,
      paymentMethodBreakdown,
    };
  }
}
