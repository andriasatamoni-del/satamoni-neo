import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { PurchaseNotFoundError } from "../../domain/errors";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { PurchaseConfirmedEvent } from "../../domain/events/purchase-confirmed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

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
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: ConfirmPurchaseCommand): Promise<Purchase> {
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
        });
        await this.movements.recordMovement(movement, { allowNegativeBalance: true });
      }
      purchase.markPostedToInventory();
      await this.eventBus.publish(new PurchaseConfirmedEvent(purchase.id, purchase.branchId, purchase.amount, command.reviewedBy));
    }

    await this.purchases.save(purchase);
    return purchase;
  }
}
