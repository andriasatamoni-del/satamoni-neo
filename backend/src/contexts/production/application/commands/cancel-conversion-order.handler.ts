import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";

export interface CancelConversionOrderCommand {
  conversionOrderId: string;
  cancelledBy?: string | null;
  reason?: string | null;
}

@Injectable()
export class CancelConversionOrderHandler {
  constructor(
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort
  ) {}

  async execute(command: CancelConversionOrderCommand): Promise<ConversionOrder> {
    const order = await this.conversionOrders.findById(command.conversionOrderId);
    if (!order) throw new ConversionOrderNotFoundError();

    // لو كان قيد التنفيذ، المكوّنات كانت اتخصمت فعليًا وقت start() - لازم ترجع للمخزون قبل الإلغاء
    if (order.status === "IN_PROGRESS") {
      for (const line of order.inputLines) {
        if (line.actualQuantity === null) continue;
        const reversal = StockMovement.register({
          inventoryItemId: line.ingredientItemId,
          branchId: order.branchId,
          movementType: "PRODUCTION_REVERSAL",
          quantityDelta: line.actualQuantity,
          referenceType: "conversion_order",
          referenceId: order.id,
          performedBy: command.cancelledBy,
        });
        await this.movements.recordMovement(reversal, { allowNegativeBalance: true });
      }
    }

    order.cancel({ cancelledBy: command.cancelledBy, reason: command.reason });
    await this.conversionOrders.save(order);
    return order;
  }
}
