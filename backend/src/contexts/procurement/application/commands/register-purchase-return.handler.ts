import { Inject, Injectable } from "@nestjs/common";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../../inventory/domain/ports/inventory-item-repository.port";

export interface RegisterPurchaseReturnCommand {
  branchId: string;
  supplierId?: string | null;
  goodsReceiptId?: string | null;
  reason: string;
  notes?: string | null;
  createdBy?: string | null;
  lines: { inventoryItemId: string; quantity: number; unit: string; unitCost?: number | null }[];
}

// بيحل تكلفة كل بند وقت التسجيل (قيمة صريحة -> inventory_items.unit_cost الحالي) - مفيش batch/FEFO
// هنا زي الريبو القديم (راجع تعليق PurchaseReturn aggregate)، فالتكلفة دي تقدير وقت التسجيل بس، مش
// معاد حسابها وقت الترحيل (تبسيط: مفيش حاجة زمن-حساسة تتغيّر بينهم زي batch cost)
@Injectable()
export class RegisterPurchaseReturnHandler {
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort
  ) {}

  async execute(command: RegisterPurchaseReturnCommand): Promise<PurchaseReturn> {
    const lines = [];
    for (const line of command.lines) {
      let unitCost = line.unitCost ?? null;
      if (unitCost === null) {
        const item = await this.inventoryItems.findById(line.inventoryItemId);
        unitCost = item?.unitCost ?? null;
      }
      lines.push({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, unit: line.unit, unitCost });
    }

    const purchaseReturn = PurchaseReturn.register({ ...command, lines });
    await this.returns.save(purchaseReturn);
    return purchaseReturn;
  }
}
