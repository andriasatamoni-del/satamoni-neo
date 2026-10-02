import { auditDetail } from "../../../../shared/audit/audit-context";
import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import { GoodsReceiptNotFoundError } from "../../domain/errors";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../../inventory/domain/ports/inventory-item-repository.port";
import {
  INVENTORY_BATCH_REPOSITORY,
  type InventoryBatchRepositoryPort,
} from "../../../inventory/domain/ports/inventory-batch-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { InventoryBatch } from "../../../inventory/domain/inventory-batch.aggregate";
import { GoodsReceiptConfirmedEvent } from "../../domain/events/goods-receipt-confirmed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { assertWithinOrderedQuantity, confirmedReceivedByItem } from "../../domain/receipt-quantity-guard";
import { PurchaseOrderNotFoundError } from "../../domain/errors";

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
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(INVENTORY_BATCH_REPOSITORY) private readonly batches: InventoryBatchRepositoryPort,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1 (BL-01): single transaction with a row lock on the receipt (concurrent confirms queue; the first wins, the
  // rest see CONFIRMED and are rejected before any stock/journal write) and on the purchase order (serialises cumulative
  // over-receipt checks between DIFFERENT receipts of the same PO). Stock, cost update, batches, PO status and the AP
  // journal commit or roll back together.
  async execute(command: ConfirmGoodsReceiptCommand): Promise<GoodsReceipt> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: ConfirmGoodsReceiptCommand): Promise<GoodsReceipt> {
    if (!(await this.tx.lockRow("goods_receipts", command.goodsReceiptId))) throw new GoodsReceiptNotFoundError();
    const receipt = await this.receipts.findById(command.goodsReceiptId);
    if (!receipt) throw new GoodsReceiptNotFoundError();

    auditDetail({ entityType: "goods_receipts", entityId: receipt.id, before: { status: receipt.status }, branchId: receipt.branchId });
    receipt.confirm(); // rejects a receipt that is already CONFIRMED - before any side effect

    if (receipt.purchaseOrderId) {
      if (!(await this.tx.lockRow("purchase_orders", receipt.purchaseOrderId))) throw new PurchaseOrderNotFoundError();
      const order = await this.purchaseOrders.findById(receipt.purchaseOrderId);
      if (!order) throw new PurchaseOrderNotFoundError();
      const linked = await this.receipts.list({ purchaseOrderId: order.id });
      assertWithinOrderedQuantity(order, confirmedReceivedByItem(linked, receipt.id), receipt.lines);
    }

    await this.receipts.save(receipt);

    let totalValue = 0;
    const orderedLines = [...receipt.lines].sort((a, b) => (a.inventoryItemId < b.inventoryItemId ? -1 : a.inventoryItemId > b.inventoryItemId ? 1 : 0));
    for (const line of orderedLines) {
      totalValue += line.quantity * line.unitCost;
      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: receipt.branchId,
        movementType: "RECEIPT",
        quantityDelta: line.quantity,
        referenceType: "goods_receipt",
        referenceId: receipt.id,
        performedBy: command.confirmedBy,
        unitCost: line.unitCost,
      });
      // استلام دايمًا بيزوّد الرصيد (كمية موجبة) - سياسة الرصيد السالب مش هتتفعّل خالص هنا عمليًا،
      // allowNegativeBalance: true بس عشان مفيش داعي نجيب الصنف ونتأكد من سياسته لحاجة مستحيل تحصل
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });

      // تكلفة الاستلام الفعلية بتحدّث سعر مرجع الصنف (last-cost) - عشان محرك تكلفة الطعام يحسب
      // "النظري" بأحدث سعر شراء حقيقي، مش سعر التأسيس الأول اللي ممكن يبقى قديم جدًا. قرار متعمد:
      // last-cost مش weighted-average - أبسط ويطابق نفس مستوى الدقة اللي الريبو القديم بيوفره فعليًا
      const inventoryItem = await this.inventoryItems.findById(line.inventoryItemId);
      if (inventoryItem) {
        inventoryItem.updateUnitCost(line.unitCost);
        await this.inventoryItems.save(inventoryItem);
      }

      // BATCH-1: دفعة بس لو البند له تاريخ صلاحية/إنتاج فعلي - نفس شرط الريبو القديم بالظبط
      // (batch_number || expiry_date)، هنا مبسّط لـexpiry_date/production_date بس
      if (line.expiryDate || line.productionDate) {
        const batch = InventoryBatch.register({
          batchNumber: await this.batches.nextBatchNumber(),
          inventoryItemId: line.inventoryItemId,
          branchId: receipt.branchId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          expiryDate: line.expiryDate,
          productionDate: line.productionDate,
          sourceType: "purchase",
          sourceId: receipt.id,
          createdBy: command.confirmedBy,
        });
        await this.batches.save(batch);
      }
    }

    if (receipt.purchaseOrderId) await this.refreshPurchaseOrderStatus(receipt.purchaseOrderId);

    await this.eventBus.publish(
      new GoodsReceiptConfirmedEvent(receipt.id, receipt.branchId, receipt.supplierId, totalValue, command.confirmedBy ?? null)
    );

    return receipt;
  }

  // PROC-BUG-1: حالة أمر الشراء بتتحسب من إجمالي كل أذون الاستلام المؤكدة المربوطة بيه (مش الإذن ده بس)
  // - عشان استلامين جزئيين متتاليين يوصّلوا الأمر لـRECEIVED صح
  private async refreshPurchaseOrderStatus(purchaseOrderId: string): Promise<void> {
    const order = await this.purchaseOrders.findById(purchaseOrderId);
    if (!order) return;
    const receivedByItem = new Map<string, number>();
    const linkedReceipts = await this.receipts.list({ purchaseOrderId });
    for (const linked of linkedReceipts) {
      if (linked.status !== "CONFIRMED") continue;
      for (const line of linked.lines) {
        receivedByItem.set(line.inventoryItemId, (receivedByItem.get(line.inventoryItemId) ?? 0) + line.quantity);
      }
    }
    order.applyReceivedQuantities(receivedByItem);
    await this.purchaseOrders.save(order);
  }
}
