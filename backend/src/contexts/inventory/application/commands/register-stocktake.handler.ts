import { Inject, Injectable } from "@nestjs/common";
import { Stocktake } from "../../domain/stocktake.aggregate";
import { StockMovement } from "../../domain/stock-movement.aggregate";
import { STOCKTAKE_REPOSITORY, type StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import { StocktakeCommittedEvent } from "../../domain/events/stocktake-committed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface RegisterStocktakeCommand {
  branchId: string;
  createdBy?: string | null;
  notes?: string | null;
  lines: { inventoryItemId: string; actualQuantity: number; reason?: string | null; chargeAccountCode?: string | null }[];
}

// نفس تدفق /api/stocktake (POST) في الريبو القديم بالظبط: رصيد النظام بيتحسب حيّ وقت التسجيل (مش
// مُدخل من العميل) عشان مايكونش قابل للتلاعب، وسطور الفرق=صفر بتتجاهل قبل حتى ما توصل للأجريجيت
@Injectable()
export class RegisterStocktakeHandler {
  constructor(
    @Inject(STOCKTAKE_REPOSITORY) private readonly stocktakes: StocktakeRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterStocktakeCommand): Promise<Stocktake> {
    const resolvedLines = [];
    for (const line of command.lines) {
      const systemQuantity = await this.movements.getBalance(command.branchId, line.inventoryItemId);
      const item = await this.inventoryItems.findById(line.inventoryItemId);
      resolvedLines.push({
        inventoryItemId: line.inventoryItemId,
        systemQuantity,
        actualQuantity: line.actualQuantity,
        unitCost: item?.unitCost ?? null,
        reason: line.reason,
        chargeAccountCode: line.chargeAccountCode,
      });
    }

    const stocktake = Stocktake.register({ ...command, lines: resolvedLines });

    for (const line of stocktake.lines) {
      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: stocktake.branchId,
        movementType: "STOCK_COUNT",
        quantityDelta: line.varianceQuantity,
        referenceType: "stocktake",
        referenceId: stocktake.id,
        performedBy: command.createdBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
      stocktake.assignMovementToLine(line.id, movement.id);
    }

    await this.stocktakes.save(stocktake);

    const chargeableLines = stocktake.lines.filter((l) => l.varianceValue && l.chargeAccountCode && l.inventoryMovementId);
    if (chargeableLines.length > 0) {
      await this.eventBus.publish(
        new StocktakeCommittedEvent(
          stocktake.id,
          stocktake.branchId,
          command.createdBy ?? null,
          chargeableLines.map((l) => ({
            inventoryMovementId: l.inventoryMovementId!,
            varianceQuantity: l.varianceQuantity,
            varianceValue: l.varianceValue!,
            chargeAccountCode: l.chargeAccountCode!,
          }))
        )
      );
    }

    return stocktake;
  }
}
