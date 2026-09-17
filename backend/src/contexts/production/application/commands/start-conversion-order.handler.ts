import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../../inventory/domain/ports/inventory-item-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";

export interface StartConversionOrderCommand {
  conversionOrderId: string;
  // {ingredientItemId, actualQuantity}[] اختياري - لو مش متبعت، الاستهلاك الفعلي = المخطط بالظبط (نفس
  // سلوك production.js في الريبو القديم لما actualConsumption مش متبعت)
  actualConsumption?: { ingredientItemId: string; actualQuantity: number }[];
  performedBy?: string | null;
  stockApproved?: boolean;
}

@Injectable()
export class StartConversionOrderHandler {
  constructor(
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort
  ) {}

  async execute(command: StartConversionOrderCommand): Promise<ConversionOrder> {
    const order = await this.conversionOrders.findById(command.conversionOrderId);
    if (!order) throw new ConversionOrderNotFoundError();

    const overrideByItem = new Map((command.actualConsumption ?? []).map((a) => [a.ingredientItemId, a.actualQuantity]));
    const consumptions: { ingredientItemId: string; actualQuantity: number; unitCost: number | null; movementId: string }[] = [];

    for (const line of order.inputLines) {
      const actualQuantity = overrideByItem.get(line.ingredientItemId) ?? line.plannedQuantity;
      const inventoryItem = await this.inventoryItems.findById(line.ingredientItemId);
      const allowNegative = inventoryItem?.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.stockApproved;

      const movement = StockMovement.register({
        inventoryItemId: line.ingredientItemId,
        branchId: order.branchId,
        movementType: "PRODUCTION_OUT",
        quantityDelta: -actualQuantity,
        referenceType: "conversion_order",
        referenceId: order.id,
        performedBy: command.performedBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: allowNegative });

      consumptions.push({
        ingredientItemId: line.ingredientItemId,
        actualQuantity,
        unitCost: inventoryItem?.unitCost ?? null,
        movementId: movement.id,
      });
    }

    order.start(consumptions);
    await this.conversionOrders.save(order);
    return order;
  }
}
