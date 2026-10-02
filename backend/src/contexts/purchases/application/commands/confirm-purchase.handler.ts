import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { PurchaseNotFoundError } from "../../domain/errors";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../../inventory/domain/ports/stock-movement-repository.port";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../../inventory/domain/ports/inventory-item-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { PurchaseConfirmedEvent } from "../../domain/events/purchase-confirmed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface ConfirmPurchaseCommand {
  purchaseId: string;
  reviewedBy: string | null;
}

// اعتماد مشترى - نفس فلسفة ConfirmGoodsReceiptHandler بالظبط: بيرحّل حركة RECEIPT حقيقية لكل بند في
// Inventory مباشرة (اتساق فوري)، وبينشر حدث لـAccounting يرحّل القيد المحاسبي (فشله - زي دليل حسابات
// لسه مش معدّ - مقبول يتسجل تحذير بس، مش يفشل الاعتماد). مشترى من غير بنود (amount حر) مبيرحّلش أي
// حركة مخزون خالص - نفس تبسيط الريبو القديم بالحرف (راجع تعليق purchase.aggregate.ts)
@Injectable()
export class ConfirmPurchaseHandler {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1: one transaction per business command - the state change, its side effects and the critical event
  // subscribers (accounting posting) commit or roll back together.
  async execute(command: ConfirmPurchaseCommand): Promise<Purchase> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: ConfirmPurchaseCommand): Promise<Purchase> {
    await this.tx.lockRow("purchases", command.purchaseId); // serialise concurrent identical commands; later ones see the new state and are rejected
    const purchase = await this.purchases.findById(command.purchaseId);
    if (!purchase) throw new PurchaseNotFoundError();

    purchase.confirm({ reviewedBy: command.reviewedBy });

    if (purchase.lines.length > 0) {
      for (const line of purchase.lines) {
        const movement = StockMovement.register({
          inventoryItemId: line.inventoryItemId,
          branchId: purchase.branchId,
          movementType: "RECEIPT",
          quantityDelta: line.quantity,
          referenceType: "purchase",
          referenceId: purchase.id,
          performedBy: command.reviewedBy,
          unitCost: line.unitPrice,
        });
        await this.movements.recordMovement(movement, { allowNegativeBalance: true });

        const inventoryItem = await this.inventoryItems.findById(line.inventoryItemId);
        if (inventoryItem) {
          inventoryItem.updateUnitCost(line.unitPrice);
          await this.inventoryItems.save(inventoryItem);
        }
      }
      purchase.markPostedToInventory();
      await this.eventBus.publish(new PurchaseConfirmedEvent(purchase.id, purchase.branchId, purchase.amount, command.reviewedBy));
    }

    await this.purchases.save(purchase);
    return purchase;
  }
}
