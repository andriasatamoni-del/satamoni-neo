import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { InvalidPurchaseLineError } from "../../domain/errors";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../../inventory/domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../../procurement/domain/ports/supplier-repository.port";
import { SupplierNotFoundError } from "../../../procurement/domain/errors";
import { DuplicatePurchaseReferenceError } from "../../domain/errors";
import { PurchaseConfirmedEvent } from "../../domain/events/purchase-confirmed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface RegisterPurchaseCommand {
  branchId: string;
  businessDate: Date;
  category?: string | null;
  amount?: number;
  notes?: string | null;
  supplierId?: string | null;
  supplierDocumentNumber?: string | null;
  items?: { inventoryItemId: string; quantity: number; unitPrice: number }[];
  initialStatus: "PENDING" | "CONFIRMED";
  createdBy?: string | null;
  acknowledgeDuplicate?: boolean;
}

// تسجيل مشترى - نفس تحقق POST /api/purchases بالريبو القديم بالحرف: بنود لازم تكون مواد خام موجودة
// فعلًا (الكاشير میقدرش يسجل صنف جديد)، فحص تكرار مرجع المورد (لو مورد+رقم مستند محددين) قبل التسجيل.
// لو initialStatus=CONFIRMED (مش كاشير) وفيه بنود، بيترحّل مخزون+قيد فورًا وقت التسجيل نفسه - نفس
// منطق ConfirmPurchaseHandler بالظبط (التسجيل هنا هو الاعتماد نفسه لما الدور مش كاشير)
@Injectable()
export class RegisterPurchaseHandler {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterPurchaseCommand): Promise<Purchase> {
    if (command.supplierId && !(await this.suppliers.findById(command.supplierId))) throw new SupplierNotFoundError();

    if (command.supplierId && command.supplierDocumentNumber && !command.acknowledgeDuplicate) {
      const duplicates = await this.purchases.findDuplicateReference({
        supplierId: command.supplierId,
        supplierDocumentNumber: command.supplierDocumentNumber,
        branchId: command.branchId,
      });
      if (duplicates.length > 0) throw new DuplicatePurchaseReferenceError();
    }

    let resolvedItems: { inventoryItemId: string; quantity: number; unit: string | null; unitPrice: number }[] | undefined;
    if (command.items && command.items.length > 0) {
      resolvedItems = [];
      for (const item of command.items) {
        const invItem = await this.inventoryItems.findById(item.inventoryItemId);
        if (!invItem || invItem.itemType !== "raw") throw new InvalidPurchaseLineError();
        resolvedItems.push({ inventoryItemId: item.inventoryItemId, quantity: item.quantity, unit: invItem.unit, unitPrice: item.unitPrice });
      }
    }

    const purchase = Purchase.register({ ...command, items: resolvedItems });

    if (purchase.status === "CONFIRMED" && purchase.lines.length > 0) {
      for (const line of purchase.lines) {
        const movement = StockMovement.register({
          inventoryItemId: line.inventoryItemId,
          branchId: purchase.branchId,
          movementType: "RECEIPT",
          quantityDelta: line.quantity,
          referenceType: "purchase",
          referenceId: purchase.id,
          performedBy: command.createdBy ?? null,
        });
        await this.movements.recordMovement(movement, { allowNegativeBalance: true });
      }
      purchase.markPostedToInventory();
      await this.eventBus.publish(new PurchaseConfirmedEvent(purchase.id, purchase.branchId, purchase.amount, command.createdBy ?? null));
    }

    await this.purchases.save(purchase);
    return purchase;
  }
}
