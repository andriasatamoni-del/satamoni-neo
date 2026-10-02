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
import { TransactionService } from "../../../../shared/database/transaction-context";

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
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1 (BL-03): one transaction + row lock; the state is validated before any ingredient is consumed, so concurrent
  // starts consume the ingredients exactly once and a rejected start writes nothing.
  async execute(command: StartConversionOrderCommand): Promise<ConversionOrder> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: StartConversionOrderCommand): Promise<ConversionOrder> {
    if (!(await this.tx.lockRow("conversion_orders", command.conversionOrderId))) throw new ConversionOrderNotFoundError();
    const order = await this.conversionOrders.findById(command.conversionOrderId);
    if (!order) throw new ConversionOrderNotFoundError();
    order.assertStartable();

    const overrideByItem = new Map((command.actualConsumption ?? []).map((a) => [a.ingredientItemId, a.actualQuantity]));
    const consumptions: { ingredientItemId: string; actualQuantity: number; unitCost: number | null; movementId: string }[] = [];

    const inputLines = [...order.inputLines].sort((a, b) => (a.ingredientItemId < b.ingredientItemId ? -1 : a.ingredientItemId > b.ingredientItemId ? 1 : 0));
    for (const line of inputLines) {
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
        unitCost: inventoryItem?.unitCost ?? null,
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
