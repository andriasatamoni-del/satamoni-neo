import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import { GoodsReceiptNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { GoodsReceiptConfirmedEvent } from "../../domain/events/goods-receipt-confirmed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface ConfirmGoodsReceiptCommand {
  goodsReceiptId: string;
  confirmedBy?: string | null;
}

// نقطة الترحيل الوحيدة للمخزون في Procurement - بيأكد الإذن ثم يرحّل حركة RECEIPT حقيقية لكل بند في
// Inventory context مباشرة (نفس فلسفة الريبو القديم بالظبط: "الترحيل الفعلي بيحصل عند التأكيد بس").
// ده تعاون بين Procurement وInventory بييجي عن طريق port بتاع Inventory مباشرة (مش domain event) لأن
// الاتساق هنا لازم يكون فوري/مضمون وقت التأكيد نفسه - مفيش subscriber غير متزامن يقدر يتأخر أو يفشل من
// غير ما الإذن يتحط في حالة متضاربة (اتأكد بس المخزون ما اتحدّثش). القيد المحاسبي (Accounting) مختلف -
// نشر حدث كافي هنا لأن فشله (زي دليل حسابات لسه مش معدّ) مقبول يتسجل تحذير بس، مش يفشل تأكيد الاستلام
@Injectable()
export class ConfirmGoodsReceiptHandler {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: ConfirmGoodsReceiptCommand): Promise<GoodsReceipt> {
    const receipt = await this.receipts.findById(command.goodsReceiptId);
    if (!receipt) throw new GoodsReceiptNotFoundError();

    receipt.confirm();
    await this.receipts.save(receipt);

    let totalValue = 0;
    for (const line of receipt.lines) {
      totalValue += line.quantity * line.unitCost;
      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: receipt.branchId,
        movementType: "RECEIPT",
        quantityDelta: line.quantity,
        referenceType: "goods_receipt",
        referenceId: receipt.id,
        performedBy: command.confirmedBy,
      });
      // استلام دايمًا بيزوّد الرصيد (كمية موجبة) - سياسة الرصيد السالب مش هتتفعّل خالص هنا عمليًا،
      // allowNegativeBalance: true بس عشان مفيش داعي نجيب الصنف ونتأكد من سياسته لحاجة مستحيل تحصل
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
    }

    await this.eventBus.publish(
      new GoodsReceiptConfirmedEvent(receipt.id, receipt.branchId, receipt.supplierId, totalValue, command.confirmedBy ?? null)
    );

    return receipt;
  }
}
