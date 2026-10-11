import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { menuItems } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { orderItems, orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import type { DashboardSummary, DashboardSummaryReaderPort } from "../../domain/ports/dashboard-summary-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

@Injectable()
export class DashboardSummaryReader implements DashboardSummaryReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getSummary(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<DashboardSummary> {
    const orderRows = await this.db
      .select({ id: orders.id, branch_id: orders.branch_id, status: orders.status, total: orders.total, created_at: orders.created_at })
      .from(orders)
      .where(
        and(
          gte(orders.created_at, input.fromTs),
          lte(orders.created_at, input.toTs),
          input.branchId ? eq(orders.branch_id, input.branchId) : undefined
        )
      );

    const activeOrders = orderRows.filter((o) => o.status !== "cancelled");
    const revenue = activeOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = activeOrders.length;
    const cancelledCount = orderRows.length - orderCount;
    const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    const dailyMap = new Map<string, number>();
    for (const o of activeOrders) {
      const date = businessDateString(o.created_at);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + Number(o.total));
    }
    const dailyTrend = [...dailyMap.entries()]
      .map(([date, rev]) => ({ date, revenue: rev }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const statusMap = new Map<string, number>();
    for (const o of orderRows) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
    const orderStatusBreakdown = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

    const branchMap = new Map<string, { revenue: number; orderCount: number }>();
    for (const o of activeOrders) {
      const entry = branchMap.get(o.branch_id) ?? { revenue: 0, orderCount: 0 };
      entry.revenue += Number(o.total);
      entry.orderCount += 1;
      branchMap.set(o.branch_id, entry);
    }
    const branchIds = [...branchMap.keys()];
    const branchRows =
      branchIds.length > 0 ? await this.db.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.id, branchIds)) : [];
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
        .select({
          menu_item_id: orderItems.menu_item_id,
          name: menuItems.name,
          quantity: orderItems.quantity,
          line_total: orderItems.line_total,
        })
        .from(orderItems)
        .innerJoin(menuItems, eq(menuItems.id, orderItems.menu_item_id))
        .where(inArray(orderItems.order_id, activeOrderIds));
      for (const row of itemRows) {
        // INNER JOIN على menu_items بيستبعد سطور العروض (menu_item_id فاضي) من الأساس - الـ! هنا أمان
        // نوعي بس، مش افتراض جديد
        const menuItemId = row.menu_item_id!;
        const entry = itemMap.get(menuItemId) ?? { name: row.name, quantity: 0, revenue: 0 };
        entry.quantity += row.quantity;
        entry.revenue += Number(row.line_total);
        itemMap.set(menuItemId, entry);
      }
    }
    const topItemsByRevenue = [...itemMap.entries()]
      .map(([menuItemId, v]) => ({ menuItemId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const paymentRows = await this.db
      .select({ payment_method_id: payments.payment_method_id, name: paymentMethods.name, amount: payments.amount })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.payment_method_id))
      .where(
        and(
          gte(payments.locked_at, input.fromTs),
          lte(payments.locked_at, input.toTs),
          input.branchId ? eq(payments.branch_id, input.branchId) : undefined
        )
      );
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
      from: businessDateString(input.fromTs),
      to: businessDateString(input.toTs),
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
