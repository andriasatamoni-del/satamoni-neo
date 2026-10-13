import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { DriverNotFoundError } from "../../domain/errors";
import { DRIVER_ORDER_BONUS_EGP } from "../../domain/driver-bonus-policy";
import type {
  DriverDayOrdersReport,
  DriverSettlementPreview,
  DriverSettlementReaderPort,
  PendingSettlementDriver,
} from "../../domain/ports/driver-settlement-reader.port";
import { businessDayStartUtc, businessDayEndUtc, businessDateString } from "../../../../shared/time/business-date";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { paymentMethods } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import { deliveryAssignments, drivers } from "./delivery.tables";

@Injectable()
export class DriverSettlementReader implements DriverSettlementReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async previewUnsettled(driverId: string): Promise<DriverSettlementPreview> {
    const rows = await this.db
      .select({ total: orders.total, collected_amount: deliveryAssignments.collected_amount, method_kind: paymentMethods.kind })
      .from(deliveryAssignments)
      .innerJoin(orders, eq(orders.id, deliveryAssignments.order_id))
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .where(
        and(
          eq(deliveryAssignments.driver_id, driverId),
          eq(deliveryAssignments.status, "DELIVERED"),
          isNull(deliveryAssignments.settlement_id)
        )
      );

    let codExpected = 0;
    let codCollected = 0;
    for (const row of rows) {
      if (row.method_kind === "cash") {
        codExpected += Number(row.total);
        codCollected += Number(row.collected_amount ?? row.total);
      }
    }
    return {
      driverId,
      orderCount: rows.length,
      codExpected,
      codCollected,
      expectedHandover: codCollected,
      bonusTotal: rows.length * DRIVER_ORDER_BONUS_EGP,
    };
  }

  async listPendingDrivers(branchId: string): Promise<PendingSettlementDriver[]> {
    const rows = await this.db
      .select({ driver_id: drivers.id, driver_name: drivers.name, total: orders.total, method_kind: paymentMethods.kind })
      .from(deliveryAssignments)
      .innerJoin(drivers, eq(drivers.id, deliveryAssignments.driver_id))
      .innerJoin(orders, eq(orders.id, deliveryAssignments.order_id))
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .where(
        and(
          eq(deliveryAssignments.branch_id, branchId),
          eq(deliveryAssignments.status, "DELIVERED"),
          isNull(deliveryAssignments.settlement_id)
        )
      );

    const byDriver = new Map<string, PendingSettlementDriver>();
    for (const row of rows) {
      const existing = byDriver.get(row.driver_id) ?? {
        driverId: row.driver_id,
        driverName: row.driver_name,
        pendingOrderCount: 0,
        pendingCash: 0,
      };
      existing.pendingOrderCount += 1;
      if (row.method_kind === "cash") existing.pendingCash += Number(row.total);
      byDriver.set(row.driver_id, existing);
    }
    return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
  }

  async getDriverDayOrders(driverId: string, date?: string): Promise<DriverDayOrdersReport> {
    const [driver] = await this.db.select({ id: drivers.id, name: drivers.name }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver) throw new DriverNotFoundError();

    const businessDate = date || businessDateString();
    const dayStart = businessDayStartUtc(businessDate);
    const dayEnd = businessDayEndUtc(businessDate);

    const rows = await this.db
      .select({
        assignment_id: deliveryAssignments.id,
        order_id: deliveryAssignments.order_id,
        delivered_at: deliveryAssignments.delivered_at,
        collected_amount: deliveryAssignments.collected_amount,
        settlement_id: deliveryAssignments.settlement_id,
        total: orders.total,
        payment_kind: paymentMethods.kind,
      })
      .from(deliveryAssignments)
      .innerJoin(orders, eq(orders.id, deliveryAssignments.order_id))
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .where(
        and(
          eq(deliveryAssignments.driver_id, driverId),
          eq(deliveryAssignments.status, "DELIVERED"),
          gte(deliveryAssignments.delivered_at, dayStart),
          lte(deliveryAssignments.delivered_at, dayEnd)
        )
      )
      .orderBy(asc(deliveryAssignments.delivered_at));

    const dayOrders = rows.map((r) => ({
      assignmentId: r.assignment_id,
      orderId: r.order_id,
      total: Number(r.total),
      collectedAmount: r.collected_amount === null ? null : Number(r.collected_amount),
      deliveredAt: r.delivered_at as Date,
      paymentKind: r.payment_kind,
      bonus: DRIVER_ORDER_BONUS_EGP,
      collected: r.settlement_id !== null,
    }));

    const cashOrders = dayOrders.filter((o) => o.paymentKind === "cash");
    return {
      driverId,
      driverName: driver.name,
      date: businessDate,
      orders: dayOrders,
      orderCount: dayOrders.length,
      bonusTotal: dayOrders.length * DRIVER_ORDER_BONUS_EGP,
      collectedBonusTotal: dayOrders.filter((o) => o.collected).length * DRIVER_ORDER_BONUS_EGP,
      pendingBonusTotal: dayOrders.filter((o) => !o.collected).length * DRIVER_ORDER_BONUS_EGP,
      cashPendingCount: cashOrders.filter((o) => !o.collected).length,
      cashCollectedCount: cashOrders.filter((o) => o.collected).length,
    };
  }
}
