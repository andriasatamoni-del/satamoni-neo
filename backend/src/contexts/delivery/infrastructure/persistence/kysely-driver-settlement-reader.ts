import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { DriverNotFoundError } from "../../domain/errors";
import { DRIVER_ORDER_BONUS_EGP } from "../../domain/driver-bonus-policy";
import type {
  DriverDayOrdersReport,
  DriverSettlementPreview,
  DriverSettlementReaderPort,
  PendingSettlementDriver,
} from "../../domain/ports/driver-settlement-reader.port";

@Injectable()
export class KyselyDriverSettlementReader implements DriverSettlementReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async previewUnsettled(driverId: string): Promise<DriverSettlementPreview> {
    const rows = await this.db
      .selectFrom("delivery_assignments")
      .innerJoin("orders", "orders.id", "delivery_assignments.order_id")
      .leftJoin("payment_methods", "payment_methods.id", "orders.payment_method_id")
      .select(["orders.total as total", "delivery_assignments.collected_amount as collected_amount", "payment_methods.kind as method_kind"])
      .where("delivery_assignments.driver_id", "=", driverId)
      .where("delivery_assignments.status", "=", "DELIVERED")
      .where("delivery_assignments.settlement_id", "is", null)
      .execute();

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
      .selectFrom("delivery_assignments")
      .innerJoin("drivers", "drivers.id", "delivery_assignments.driver_id")
      .innerJoin("orders", "orders.id", "delivery_assignments.order_id")
      .leftJoin("payment_methods", "payment_methods.id", "orders.payment_method_id")
      .select(["drivers.id as driver_id", "drivers.name as driver_name", "orders.total as total", "payment_methods.kind as method_kind"])
      .where("delivery_assignments.branch_id", "=", branchId)
      .where("delivery_assignments.status", "=", "DELIVERED")
      .where("delivery_assignments.settlement_id", "is", null)
      .execute();

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
    const driver = await this.db.selectFrom("drivers").select(["id", "name"]).where("id", "=", driverId).executeTakeFirst();
    if (!driver) throw new DriverNotFoundError();

    const businessDate = date || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${businessDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${businessDate}T23:59:59.999Z`);

    const rows = await this.db
      .selectFrom("delivery_assignments")
      .innerJoin("orders", "orders.id", "delivery_assignments.order_id")
      .leftJoin("payment_methods", "payment_methods.id", "orders.payment_method_id")
      .select([
        "delivery_assignments.id as assignment_id",
        "delivery_assignments.order_id as order_id",
        "delivery_assignments.delivered_at as delivered_at",
        "delivery_assignments.collected_amount as collected_amount",
        "delivery_assignments.settlement_id as settlement_id",
        "orders.total as total",
        "payment_methods.kind as payment_kind",
      ])
      .where("delivery_assignments.driver_id", "=", driverId)
      .where("delivery_assignments.status", "=", "DELIVERED")
      .where("delivery_assignments.delivered_at", ">=", dayStart)
      .where("delivery_assignments.delivered_at", "<=", dayEnd)
      .orderBy("delivery_assignments.delivered_at")
      .execute();

    const orders = rows.map((r) => ({
      assignmentId: r.assignment_id,
      orderId: r.order_id,
      total: Number(r.total),
      collectedAmount: r.collected_amount === null ? null : Number(r.collected_amount),
      deliveredAt: r.delivered_at as Date,
      paymentKind: r.payment_kind,
      bonus: DRIVER_ORDER_BONUS_EGP,
      collected: r.settlement_id !== null,
    }));

    const cashOrders = orders.filter((o) => o.paymentKind === "cash");
    return {
      driverId,
      driverName: driver.name,
      date: businessDate,
      orders,
      orderCount: orders.length,
      bonusTotal: orders.length * DRIVER_ORDER_BONUS_EGP,
      collectedBonusTotal: orders.filter((o) => o.collected).length * DRIVER_ORDER_BONUS_EGP,
      pendingBonusTotal: orders.filter((o) => !o.collected).length * DRIVER_ORDER_BONUS_EGP,
      cashPendingCount: cashOrders.filter((o) => !o.collected).length,
      cashCollectedCount: cashOrders.filter((o) => o.collected).length,
    };
  }
}
