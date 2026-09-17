import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { ConversionOrderCompletedEvent } from "../../domain/events/conversion-order-completed.event";

export interface CompleteConversionOrderCommand {
  conversionOrderId: string;
  actualOutputQuantity: number;
  varianceReason?: string | null;
  completedBy?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class CompleteConversionOrderHandler {
  constructor(
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: CompleteConversionOrderCommand): Promise<ConversionOrder> {
    const order = await this.conversionOrders.findById(command.conversionOrderId);
    if (!order) throw new ConversionOrderNotFoundError();

    // standardUnitCost = تكلفة الوصفة القياسية (كمية كل مكوّن لكل وحدة ناتج × تكلفة الوحدة وقت البدء) -
    // بيقيّم بيها الكمية الفعلية المنتجة، مش تكلفة المستهلك فعليًا (rawMaterialValue) - الفرق بينهم هو
    // فرق الإنتاج (Yield Variance) الحقيقي، راجع تعليق conversion-order.aggregate.ts
    const hasIncompleteCost = order.inputLines.some((l) => l.unitCost === null);
    const standardUnitCost = hasIncompleteCost
      ? null
      : order.inputLines.reduce((sum, l) => sum + l.plannedQuantityPerUnit * (l.unitCost ?? 0), 0);

    const movement = StockMovement.register({
      inventoryItemId: order.outputItemId,
      branchId: order.branchId,
      movementType: "PRODUCTION_IN",
      quantityDelta: command.actualOutputQuantity,
      referenceType: "conversion_order",
      referenceId: order.id,
      performedBy: command.completedBy,
    });
    await this.movements.recordMovement(movement, { allowNegativeBalance: true });

    order.complete({
      actualOutputQuantity: command.actualOutputQuantity,
      varianceReason: command.varianceReason,
      outputUnitCost: standardUnitCost,
      outputMovementId: movement.id,
      completedBy: command.completedBy ?? null,
    });
    await this.conversionOrders.save(order);

    const finishedGoodsValue = standardUnitCost !== null ? round2(standardUnitCost * command.actualOutputQuantity) : 0;
    const rawMaterialValue = round2(order.inputLines.reduce((sum, l) => sum + (l.actualQuantity ?? 0) * (l.unitCost ?? 0), 0));

    if (finishedGoodsValue > 0 || rawMaterialValue > 0) {
      await this.eventBus.publish(
        new ConversionOrderCompletedEvent(order.id, order.branchId, finishedGoodsValue, rawMaterialValue, command.completedBy ?? null)
      );
    }

    return order;
  }
}
