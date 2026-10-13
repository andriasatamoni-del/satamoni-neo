import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, countDistinct, desc, eq, gt, gte, isNotNull, lte, max, min, ne, sql, sum } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { customers } from "../../../customers/infrastructure/persistence/customers.tables";
import { deliveryAssignments, drivers } from "../../../delivery/infrastructure/persistence/delivery.tables";
import { expenseCategories, expenses } from "../../../expenses/infrastructure/persistence/expenses.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { purchases } from "../../../purchases/infrastructure/persistence/purchases.tables";
import type {
  DeliveryCustomerReportsReaderPort,
  DriverPerformanceRow,
  DeliveryServiceReport,
  PeakHoursReport,
  CustomerSpendReport,
  ExpensesReport,
  PurchasesReport,
} from "../../domain/ports/delivery-customer-reports-reader.port";
import { businessDayStartUtc, businessDayEndUtc } from "../../../../shared/time/business-date";

const DOW_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function dayRange(from: string, to: string): { fromTs: Date; toTs: Date } {
  return { fromTs: businessDayStartUtc(from), toTs: businessDayEndUtc(to) };
}

const DELIVERED = sql`${deliveryAssignments.status} = 'DELIVERED'`;
const DELIVERY_MINUTES = sql`EXTRACT(EPOCH FROM (${deliveryAssignments.delivered_at} - ${deliveryAssignments.assigned_at})) / 60`;

// a select-list alias (GROUP BY / ORDER BY "alias")
const selected = (alias: string) => sql`${sql.identifier(alias)}`;

@Injectable()
export class DeliveryCustomerReportsReader implements DeliveryCustomerReportsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getDrivers(input: { branchId: string | null; from: string; to: string }): Promise<DriverPerformanceRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const rows = await this.db
      .select({
        driver_id: drivers.id,
        driver_name: drivers.name,
        orders_count: sql<string>`COUNT(${deliveryAssignments.id}) FILTER (WHERE ${DELIVERED})`,
        revenue: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${DELIVERED}), 0)`,
        failed_count: sql<string>`COUNT(${deliveryAssignments.id}) FILTER (WHERE ${deliveryAssignments.status} = 'FAILED')`,
        avg_delivery_minutes: sql<string | null>`AVG(${DELIVERY_MINUTES}) FILTER (WHERE ${DELIVERED})`,
      })
      .from(deliveryAssignments)
      .innerJoin(drivers, eq(drivers.id, deliveryAssignments.driver_id))
      .innerJoin(orders, eq(orders.id, deliveryAssignments.order_id))
      .where(
        and(
          gte(orders.created_at, fromTs),
          lte(orders.created_at, toTs),
          input.branchId ? eq(deliveryAssignments.branch_id, input.branchId) : undefined
        )
      )
      .groupBy(drivers.id, drivers.name);

    return rows
      .map((r) => ({
        driverId: r.driver_id, driverName: r.driver_name,
        ordersCount: Number(r.orders_count), revenue: Number(r.revenue), failedCount: Number(r.failed_count),
        avgDeliveryMinutes: r.avg_delivery_minutes != null ? Number(r.avg_delivery_minutes) : null,
      }))
      .sort((a, b) => b.ordersCount - a.ordersCount);
  }

  async getDeliveryService(input: {
    branchId: string | null; from: string; to: string; thresholdMinutes: number;
  }): Promise<DeliveryServiceReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const prepMinutes = sql`EXTRACT(EPOCH FROM (${orders.kitchen_ready_at} - ${orders.created_at})) / 60`;
    const [r] = await this.db
      .select({
        total_orders: countDistinct(orders.id),
        failed_count: sql<string>`COUNT(${deliveryAssignments.id}) FILTER (WHERE ${deliveryAssignments.status} = 'FAILED')`,
        avg_prep_minutes: sql<string | null>`AVG(${prepMinutes}) FILTER (WHERE ${orders.kitchen_ready_at} IS NOT NULL)`,
        avg_delivery_minutes: sql<string | null>`AVG(${DELIVERY_MINUTES}) FILTER (WHERE ${DELIVERED})`,
        avg_total_minutes: sql<string | null>`AVG(EXTRACT(EPOCH FROM (${deliveryAssignments.delivered_at} - ${orders.created_at})) / 60) FILTER (WHERE ${DELIVERED})`,
        on_time_count: sql<string>`COUNT(${orders.id}) FILTER (WHERE ${orders.kitchen_ready_at} IS NOT NULL AND ${prepMinutes} <= ${input.thresholdMinutes})`,
        ready_count: sql<string>`COUNT(${orders.id}) FILTER (WHERE ${orders.kitchen_ready_at} IS NOT NULL)`,
      })
      .from(orders)
      .leftJoin(deliveryAssignments, eq(deliveryAssignments.order_id, orders.id))
      .where(
        and(
          eq(orders.order_type, "delivery"),
          gte(orders.created_at, fromTs),
          lte(orders.created_at, toTs),
          input.branchId ? eq(orders.branch_id, input.branchId) : undefined
        )
      );

    const totalOrders = Number(r.total_orders);
    const readyCount = Number(r.ready_count);
    return {
      thresholdMinutes: input.thresholdMinutes,
      totalOrders,
      failedCount: Number(r.failed_count),
      failureRate: totalOrders > 0 ? Number(r.failed_count) / totalOrders : null,
      avgPrepMinutes: r.avg_prep_minutes != null ? Number(r.avg_prep_minutes) : null,
      avgDeliveryMinutes: r.avg_delivery_minutes != null ? Number(r.avg_delivery_minutes) : null,
      avgTotalMinutes: r.avg_total_minutes != null ? Number(r.avg_total_minutes) : null,
      onTimeRate: readyCount > 0 ? Number(r.on_time_count) / readyCount : null,
    };
  }

  async getPeakHours(input: { branchId: string | null; from: string; to: string }): Promise<PeakHoursReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const where = and(
      ne(orders.status, "cancelled"),
      gte(orders.created_at, fromTs),
      lte(orders.created_at, toTs),
      input.branchId ? eq(orders.branch_id, input.branchId) : undefined
    );
    const hour = sql<number>`EXTRACT(HOUR FROM (${orders.created_at} AT TIME ZONE 'Africa/Cairo'))::int`;
    const dow = sql<number>`EXTRACT(DOW FROM (${orders.created_at} AT TIME ZONE 'Africa/Cairo'))::int`;
    const [byHour, byDow] = await Promise.all([
      this.db
        .select({ hour: hour.as("hour"), orders_count: count(), revenue: sum(orders.total) })
        .from(orders)
        .where(where)
        .groupBy(selected("hour"))
        .orderBy(selected("hour")),
      this.db
        .select({ dow: dow.as("dow"), orders_count: count(), revenue: sum(orders.total) })
        .from(orders)
        .where(where)
        .groupBy(selected("dow"))
        .orderBy(selected("dow")),
    ]);

    return {
      byHour: byHour.map((r) => ({ hour: Number(r.hour), ordersCount: Number(r.orders_count), revenue: Number(r.revenue) })),
      byDayOfWeek: byDow.map((r) => ({
        dow: Number(r.dow), dayName: DOW_NAMES[Number(r.dow)], ordersCount: Number(r.orders_count), revenue: Number(r.revenue),
      })),
    };
  }

  async getCustomerSpend(input: { branchId: string | null; from: string; to: string; limit: number }): Promise<CustomerSpendReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const totalSpent = sum(orders.total).as("total_spent");
    const topRows = await this.db
      .select({
        phone: orders.customer_phone,
        name: sql<string | null>`COALESCE(${customers.name}, ${orders.customer_name})`,
        orders_count: count(),
        total_spent: totalSpent,
        last_order_at: max(orders.created_at),
      })
      .from(orders)
      .leftJoin(customers, eq(customers.phone, orders.customer_phone))
      .where(
        and(
          ne(orders.status, "cancelled"),
          isNotNull(orders.customer_phone),
          gte(orders.created_at, fromTs),
          lte(orders.created_at, toTs),
          input.branchId ? eq(orders.branch_id, input.branchId) : undefined
        )
      )
      .groupBy(orders.customer_phone, customers.name, orders.customer_name)
      .orderBy(desc(selected("total_spent")))
      .limit(input.limit);

    const firstOrders = await this.db
      .select({ customer_phone: orders.customer_phone, first_order_at: min(orders.created_at) })
      .from(orders)
      .where(and(isNotNull(orders.customer_phone), input.branchId ? eq(orders.branch_id, input.branchId) : undefined))
      .groupBy(orders.customer_phone);
    const newCustomersCount = firstOrders.filter((r) => r.first_order_at! >= fromTs && r.first_order_at! <= toTs).length;

    return {
      newCustomersCount,
      topCustomers: topRows.map((r) => ({
        phone: r.phone as string, name: r.name as string | null,
        ordersCount: Number(r.orders_count), totalSpent: Number(r.total_spent),
        avgOrderValue: Number(r.total_spent) / Number(r.orders_count),
        lastOrderAt: (r.last_order_at as Date).toISOString(),
      })),
    };
  }

  async getExpensesReport(input: {
    branchId: string | null; from: string; to: string; groupBy: "day" | "month";
  }): Promise<ExpensesReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    // The period comes back through the business_date column's mapping (a raw fragment would be a string).
    const period =
      input.groupBy === "month"
        ? sql<Date>`date_trunc('month', ${expenses.business_date})::date`.mapWith(expenses.business_date)
        : sql<Date>`date(${expenses.business_date})`.mapWith(expenses.business_date);
    const base = and(
      eq(expenses.status, "POSTED"),
      gte(expenses.business_date, fromTs),
      lte(expenses.business_date, toTs),
      input.branchId ? eq(expenses.branch_id, input.branchId) : undefined
    );

    const [byCategory, trend, anomalies] = await Promise.all([
      this.db
        .select({ category: expenseCategories.name, total: sum(expenses.amount).as("total"), count: count() })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.category_id))
        .where(base)
        .groupBy(expenseCategories.name)
        .orderBy(desc(selected("total"))),
      this.db
        .select({ period: period.as("period"), total: sum(expenses.amount) })
        .from(expenses)
        .where(base)
        .groupBy(selected("period"))
        .orderBy(selected("period")),
      this.db
        .select({
          id: expenses.id,
          business_date: expenses.business_date,
          branch_id: expenses.branch_id,
          branch_name: branches.name,
          category: expenseCategories.name,
          amount: expenses.amount,
          alert_threshold: expenseCategories.alert_threshold,
          notes: expenses.notes,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.category_id))
        .leftJoin(branches, eq(branches.id, expenses.branch_id))
        .where(and(base, isNotNull(expenseCategories.alert_threshold), gt(expenses.amount, expenseCategories.alert_threshold)))
        .orderBy(desc(expenses.amount)),
    ]);

    return {
      total: byCategory.reduce((s, r) => s + Number(r.total), 0),
      byCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
      trend: trend.map((r) => ({ period: r.period.toISOString().slice(0, 10), total: Number(r.total) })),
      anomalies: anomalies.map((r) => ({
        id: r.id, businessDate: r.business_date.toISOString().slice(0, 10), branchId: r.branch_id, branchName: r.branch_name,
        category: r.category, amount: Number(r.amount), alertThreshold: Number(r.alert_threshold), notes: r.notes,
      })),
    };
  }

  async getPurchasesReport(input: {
    branchId: string | null; from: string; to: string; groupBy: "day" | "month";
  }): Promise<PurchasesReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const period =
      input.groupBy === "month"
        ? sql<Date>`date_trunc('month', ${purchases.business_date})::date`.mapWith(purchases.business_date)
        : sql<Date>`date(${purchases.business_date})`.mapWith(purchases.business_date);
    const base = and(
      eq(purchases.status, "CONFIRMED"),
      gte(purchases.business_date, fromTs),
      lte(purchases.business_date, toTs),
      input.branchId ? eq(purchases.branch_id, input.branchId) : undefined
    );

    const [byCategory, trend] = await Promise.all([
      this.db
        .select({
          category: sql<string>`COALESCE(${purchases.category}, 'غير محدد')`.as("category"),
          total: sum(purchases.amount).as("total"),
          count: count(),
        })
        .from(purchases)
        .where(base)
        .groupBy(selected("category"))
        .orderBy(desc(selected("total"))),
      this.db
        .select({ period: period.as("period"), total: sum(purchases.amount) })
        .from(purchases)
        .where(base)
        .groupBy(selected("period"))
        .orderBy(asc(selected("period"))),
    ]);

    return {
      total: byCategory.reduce((s, r) => s + Number(r.total), 0),
      byCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
      trend: trend.map((r) => ({ period: r.period.toISOString().slice(0, 10), total: Number(r.total) })),
    };
  }
}
