import { Inject, Injectable } from "@nestjs/common";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type {
  DeliveryCustomerReportsReaderPort,
  DriverPerformanceRow,
  DeliveryServiceReport,
  PeakHoursReport,
  CustomerSpendReport,
  ExpensesReport,
  PurchasesReport,
} from "../../domain/ports/delivery-customer-reports-reader.port";

const DOW_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function dayRange(from: string, to: string): { fromTs: Date; toTs: Date } {
  return { fromTs: new Date(`${from}T00:00:00.000`), toTs: new Date(`${to}T23:59:59.999`) };
}

@Injectable()
export class KyselyDeliveryCustomerReportsReader implements DeliveryCustomerReportsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getDrivers(input: { branchId: string | null; from: string; to: string }): Promise<DriverPerformanceRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    let query = this.db
      .selectFrom("delivery_assignments")
      .innerJoin("drivers", "drivers.id", "delivery_assignments.driver_id")
      .innerJoin("orders", "orders.id", "delivery_assignments.order_id")
      .select((eb) => [
        "drivers.id as driver_id",
        "drivers.name as driver_name",
        eb.fn.count("delivery_assignments.id").filterWhere("delivery_assignments.status", "=", "DELIVERED").as("orders_count"),
        eb.fn
          .coalesce(eb.fn.sum<number>("orders.total").filterWhere("delivery_assignments.status", "=", "DELIVERED"), sql<number>`0`)
          .as("revenue"),
        eb.fn.count("delivery_assignments.id").filterWhere("delivery_assignments.status", "=", "FAILED").as("failed_count"),
        eb.fn
          .avg<number>(sql<number>`EXTRACT(EPOCH FROM (delivery_assignments.delivered_at - delivery_assignments.assigned_at)) / 60`)
          .filterWhere("delivery_assignments.status", "=", "DELIVERED")
          .as("avg_delivery_minutes"),
      ])
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy(["drivers.id", "drivers.name"]);
    if (input.branchId) query = query.where("delivery_assignments.branch_id", "=", input.branchId);
    const rows = await query.execute();

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
    let query = this.db
      .selectFrom("orders")
      .leftJoin("delivery_assignments", "delivery_assignments.order_id", "orders.id")
      .select((eb) => [
        eb.fn.count("orders.id").distinct().as("total_orders"),
        eb.fn.count("delivery_assignments.id").filterWhere("delivery_assignments.status", "=", "FAILED").as("failed_count"),
        eb.fn
          .avg<number>(sql<number>`EXTRACT(EPOCH FROM (orders.kitchen_ready_at - orders.created_at)) / 60`)
          .filterWhere("orders.kitchen_ready_at", "is not", null)
          .as("avg_prep_minutes"),
        eb.fn
          .avg<number>(sql<number>`EXTRACT(EPOCH FROM (delivery_assignments.delivered_at - delivery_assignments.assigned_at)) / 60`)
          .filterWhere("delivery_assignments.status", "=", "DELIVERED")
          .as("avg_delivery_minutes"),
        eb.fn
          .avg<number>(sql<number>`EXTRACT(EPOCH FROM (delivery_assignments.delivered_at - orders.created_at)) / 60`)
          .filterWhere("delivery_assignments.status", "=", "DELIVERED")
          .as("avg_total_minutes"),
        eb.fn
          .count("orders.id")
          .filterWhere(
            sql<boolean>`orders.kitchen_ready_at IS NOT NULL AND EXTRACT(EPOCH FROM (orders.kitchen_ready_at - orders.created_at)) / 60 <= ${input.thresholdMinutes}`
          )
          .as("on_time_count"),
        eb.fn.count("orders.id").filterWhere("orders.kitchen_ready_at", "is not", null).as("ready_count"),
      ])
      .where("orders.order_type", "=", "delivery")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs);
    if (input.branchId) query = query.where("orders.branch_id", "=", input.branchId);
    const r = await query.executeTakeFirstOrThrow();

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
    let byHourQuery = this.db
      .selectFrom("orders")
      .select((eb) => [
        sql<number>`EXTRACT(HOUR FROM orders.created_at)::int`.as("hour"),
        eb.fn.countAll().as("orders_count"),
        eb.fn.sum<number>("orders.total").as("revenue"),
      ])
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy("hour")
      .orderBy("hour");
    let byDowQuery = this.db
      .selectFrom("orders")
      .select((eb) => [
        sql<number>`EXTRACT(DOW FROM orders.created_at)::int`.as("dow"),
        eb.fn.countAll().as("orders_count"),
        eb.fn.sum<number>("orders.total").as("revenue"),
      ])
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy("dow")
      .orderBy("dow");
    if (input.branchId) {
      byHourQuery = byHourQuery.where("orders.branch_id", "=", input.branchId);
      byDowQuery = byDowQuery.where("orders.branch_id", "=", input.branchId);
    }
    const [byHour, byDow] = await Promise.all([byHourQuery.execute(), byDowQuery.execute()]);

    return {
      byHour: byHour.map((r) => ({ hour: Number(r.hour), ordersCount: Number(r.orders_count), revenue: Number(r.revenue) })),
      byDayOfWeek: byDow.map((r) => ({
        dow: Number(r.dow), dayName: DOW_NAMES[Number(r.dow)], ordersCount: Number(r.orders_count), revenue: Number(r.revenue),
      })),
    };
  }

  async getCustomerSpend(input: { branchId: string | null; from: string; to: string; limit: number }): Promise<CustomerSpendReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    let topQuery = this.db
      .selectFrom("orders")
      .leftJoin("customers", "customers.phone", "orders.customer_phone")
      .select((eb) => [
        "orders.customer_phone as phone",
        eb.fn.coalesce("customers.name", "orders.customer_name").as("name"),
        eb.fn.countAll().as("orders_count"),
        eb.fn.sum<number>("orders.total").as("total_spent"),
        eb.fn.max("orders.created_at").as("last_order_at"),
      ])
      .where("orders.status", "<>", "cancelled")
      .where("orders.customer_phone", "is not", null)
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy(["orders.customer_phone", "customers.name", "orders.customer_name"])
      .orderBy("total_spent", "desc")
      .limit(input.limit);
    if (input.branchId) topQuery = topQuery.where("orders.branch_id", "=", input.branchId);
    const topRows = await topQuery.execute();

    let firstOrderQuery = this.db
      .selectFrom("orders")
      .select(["customer_phone", (eb) => eb.fn.min("orders.created_at").as("first_order_at")])
      .where("orders.customer_phone", "is not", null)
      .groupBy("customer_phone");
    if (input.branchId) firstOrderQuery = firstOrderQuery.where("orders.branch_id", "=", input.branchId);
    const firstOrders = await firstOrderQuery.execute();
    const newCustomersCount = firstOrders.filter((r) => r.first_order_at >= fromTs && r.first_order_at <= toTs).length;

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
    const trunc = input.groupBy === "month" ? sql<Date>`date_trunc('month', expenses.business_date)` : sql<Date>`date(expenses.business_date)`;

    let byCategoryQuery = this.db
      .selectFrom("expenses")
      .innerJoin("expense_categories", "expense_categories.id", "expenses.category_id")
      .select((eb) => ["expense_categories.name as category", eb.fn.sum<number>("expenses.amount").as("total"), eb.fn.countAll().as("count")])
      .where("expenses.status", "=", "POSTED")
      .where("expenses.business_date", ">=", fromTs)
      .where("expenses.business_date", "<=", toTs)
      .groupBy("expense_categories.name")
      .orderBy("total", "desc");
    let trendQuery = this.db
      .selectFrom("expenses")
      .select((eb) => [trunc.as("period"), eb.fn.sum<number>("expenses.amount").as("total")])
      .where("expenses.status", "=", "POSTED")
      .where("expenses.business_date", ">=", fromTs)
      .where("expenses.business_date", "<=", toTs)
      .groupBy("period")
      .orderBy("period");
    let anomaliesQuery = this.db
      .selectFrom("expenses")
      .innerJoin("expense_categories", "expense_categories.id", "expenses.category_id")
      .leftJoin("branches", "branches.id", "expenses.branch_id")
      .select([
        "expenses.id as id", "expenses.business_date as business_date", "expenses.branch_id as branch_id", "branches.name as branch_name",
        "expense_categories.name as category", "expenses.amount as amount", "expense_categories.alert_threshold as alert_threshold",
        "expenses.notes as notes",
      ])
      .where("expenses.status", "=", "POSTED")
      .where("expenses.business_date", ">=", fromTs)
      .where("expenses.business_date", "<=", toTs)
      .where("expense_categories.alert_threshold", "is not", null)
      .whereRef("expenses.amount", ">", "expense_categories.alert_threshold")
      .orderBy("expenses.amount", "desc");
    if (input.branchId) {
      byCategoryQuery = byCategoryQuery.where("expenses.branch_id", "=", input.branchId);
      trendQuery = trendQuery.where("expenses.branch_id", "=", input.branchId);
      anomaliesQuery = anomaliesQuery.where("expenses.branch_id", "=", input.branchId);
    }
    const [byCategory, trend, anomalies] = await Promise.all([byCategoryQuery.execute(), trendQuery.execute(), anomaliesQuery.execute()]);

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
    const trunc = input.groupBy === "month" ? sql<Date>`date_trunc('month', purchases.business_date)` : sql<Date>`date(purchases.business_date)`;

    let byCategoryQuery = this.db
      .selectFrom("purchases")
      .select((eb) => [
        eb.fn.coalesce("purchases.category", sql<string>`'غير محدد'`).as("category"),
        eb.fn.sum<number>("purchases.amount").as("total"),
        eb.fn.countAll().as("count"),
      ])
      .where("purchases.status", "=", "CONFIRMED")
      .where("purchases.business_date", ">=", fromTs)
      .where("purchases.business_date", "<=", toTs)
      .groupBy("category")
      .orderBy("total", "desc");
    let trendQuery = this.db
      .selectFrom("purchases")
      .select((eb) => [trunc.as("period"), eb.fn.sum<number>("purchases.amount").as("total")])
      .where("purchases.status", "=", "CONFIRMED")
      .where("purchases.business_date", ">=", fromTs)
      .where("purchases.business_date", "<=", toTs)
      .groupBy("period")
      .orderBy("period");
    if (input.branchId) {
      byCategoryQuery = byCategoryQuery.where("purchases.branch_id", "=", input.branchId);
      trendQuery = trendQuery.where("purchases.branch_id", "=", input.branchId);
    }
    const [byCategory, trend] = await Promise.all([byCategoryQuery.execute(), trendQuery.execute()]);

    return {
      total: byCategory.reduce((s, r) => s + Number(r.total), 0),
      byCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
      trend: trend.map((r) => ({ period: r.period.toISOString().slice(0, 10), total: Number(r.total) })),
    };
  }
}
