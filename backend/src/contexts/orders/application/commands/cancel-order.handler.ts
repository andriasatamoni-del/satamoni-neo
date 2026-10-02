import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { OrderCancelledEvent } from "../../domain/events/order-cancelled.event";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface CancelOrderCommand {
  orderId: string;
  cancelledBy?: string | null;
}

// إلغاء طلب حقيقي - عكس كامل لاستهلاك المخزون، status='cancelled'، وعكس القيود المحاسبية (بيع + تكلفة) عن طريق
// OrderCancelledEvent - أبدًا DELETE، نفس فلسفة الريبو القديم بالظبط ("مسار الاسترجاع الوحيد").
//
// Phase 3.1:
//  * BL-02 - one transaction + a row lock on the order. Concurrent cancels queue on the lock; the first one restores stock and
//    posts the reversals, every later one sees status=cancelled and is rejected before any write.
//  * BL-07 - stock is restored from the order's ACTUAL recorded consumption movements (same quantity AND same unit cost as
//    when it was sold), not recomputed from today's recipe/cost. This keeps inventory valuation and the COGS reversal exact
//    even if the recipe or item cost changed after the sale, and never "invents" stock for orders that consumed nothing.
@Injectable()
export class CancelOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  async execute(command: CancelOrderCommand): Promise<Order> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: CancelOrderCommand): Promise<Order> {
    if (!(await this.tx.lockRow("orders", command.orderId))) throw new OrderNotFoundError();
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();
    // validate BEFORE any side effect: a completed/cancelled order is rejected here (setStatus throws)
    order.setStatus("cancelled");

    const consumed = await this.movements.listByReference("order", order.id);
    const alreadyRestored = await this.movements.listByReference("order_cancellation", order.id);

    // outstanding = consumed - already restored, per ingredient (quantity and cost taken from the original movements)
    const outstanding = new Map<string, { quantity: number; totalCost: number | null }>();
    for (const m of consumed) {
      if (m.movementType !== "CONSUMPTION") continue;
      const cur = outstanding.get(m.inventoryItemId) ?? { quantity: 0, totalCost: 0 };
      cur.quantity += -m.quantityDelta;
      cur.totalCost = cur.totalCost === null || m.totalCost === null ? null : cur.totalCost + m.totalCost;
      outstanding.set(m.inventoryItemId, cur);
    }
    for (const m of alreadyRestored) {
      const cur = outstanding.get(m.inventoryItemId);
      if (cur) {
        cur.quantity -= m.quantityDelta;
        if (cur.totalCost !== null && m.totalCost !== null) cur.totalCost -= m.totalCost;
      }
    }

    await this.orders.save(order);

    const sorted = [...outstanding.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [ingredientItemId, rest] of sorted) {
      if (rest.quantity <= 0.0000001) continue;
      const movement = StockMovement.register({
        inventoryItemId: ingredientItemId,
        branchId: order.branchId,
        movementType: "ADJUSTMENT",
        quantityDelta: rest.quantity,
        referenceType: "order_cancellation",
        referenceId: order.id,
        performedBy: command.cancelledBy,
        unitCost: rest.totalCost !== null ? rest.totalCost / rest.quantity : null,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
    }

    await this.eventBus.publish(new OrderCancelledEvent(order.id, order.branchId, order.total, command.cancelledBy ?? null));

    return order;
  }
}
