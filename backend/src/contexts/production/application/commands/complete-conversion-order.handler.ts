import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import {
  INVENTORY_BATCH_REPOSITORY,
  type InventoryBatchRepositoryPort,
} from "../../../inventory/domain/ports/inventory-batch-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { InventoryBatch } from "../../../inventory/domain/inventory-batch.aggregate";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { ConversionOrderCompletedEvent } from "../../domain/events/conversion-order-completed.event";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface CompleteConversionOrderCommand {
  conversionOrderId: string;
  actualOutputQuantity: number;
  varianceReason?: string | null;
  expiryDate?: Date | null;
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
    @Inject(INVENTORY_BATCH_REPOSITORY) private readonly batches: InventoryBatchRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly getPosSettings: GetPosSettingsHandler,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1 (BL-03): one transaction + row lock on the conversion order. The state machine is validated (order.complete)
  // BEFORE any stock write, so a rejected completion (wrong state, bad quantity, missing variance reason) writes nothing,
  // and concurrent completions queue on the lock so finished goods are received exactly once.
  async execute(command: CompleteConversionOrderCommand): Promise<ConversionOrder> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: CompleteConversionOrderCommand): Promise<ConversionOrder> {
    if (!(await this.tx.lockRow("conversion_orders", command.conversionOrderId))) throw new ConversionOrderNotFoundError();
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
      unitCost: standardUnitCost,
    });

    const settings = await this.getPosSettings.execute();
    order.complete({
      actualOutputQuantity: command.actualOutputQuantity,
      varianceReason: command.varianceReason,
      outputUnitCost: standardUnitCost,
      outputMovementId: movement.id,
      completedBy: command.completedBy ?? null,
      varianceAlertPercent: settings.productionVarianceAlertPercent,
    });
    await this.movements.recordMovement(movement, { allowNegativeBalance: true });

    // BATCH-1: دفعة للناتج بس لو تاريخ صلاحية فعلي اتحدد
    if (command.expiryDate) {
      const batch = InventoryBatch.register({
        batchNumber: await this.batches.nextBatchNumber(),
        inventoryItemId: order.outputItemId,
        branchId: order.branchId,
        quantity: command.actualOutputQuantity,
        unitCost: standardUnitCost,
        expiryDate: command.expiryDate,
        sourceType: "production",
        sourceId: order.id,
        createdBy: command.completedBy,
      });
      await this.batches.save(batch);
    }

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
