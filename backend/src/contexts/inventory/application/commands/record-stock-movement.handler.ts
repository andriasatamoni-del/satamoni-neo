import { Inject, Injectable } from "@nestjs/common";
import { StockMovement } from "../../domain/stock-movement.aggregate";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";
import { InventoryItemNotFoundError } from "../../domain/errors";

export interface RecordStockMovementCommand {
  inventoryItemId: string;
  branchId: string;
  movementType: string;
  quantityDelta: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  performedBy?: string | null;
  // موافقة صريحة (بين/أدمن) وقت البيع لصنف رصيده هيبقى سالب - نفس فلسفة الريبو القديم
  // ("مسموح بموافقة مدير/أدمن (PIN) وقت البيع" - راجع تعليق negative_stock_policy في inventory_items)
  approved?: boolean;
}

@Injectable()
export class RecordStockMovementHandler {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort
  ) {}

  async execute(command: RecordStockMovementCommand): Promise<{ movement: StockMovement; balanceAfter: number }> {
    const item = await this.items.findById(command.inventoryItemId);
    if (!item) throw new InventoryItemNotFoundError();

    const allowNegativeBalance = item.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.approved;

    const movement = StockMovement.register({
      inventoryItemId: command.inventoryItemId,
      branchId: command.branchId,
      movementType: command.movementType,
      quantityDelta: command.quantityDelta,
      reason: command.reason,
      referenceType: command.referenceType,
      referenceId: command.referenceId,
      performedBy: command.performedBy,
    });

    const { balanceAfter } = await this.movements.recordMovement(movement, { allowNegativeBalance });
    return { movement, balanceAfter };
  }
}
