import { Inject, Injectable } from "@nestjs/common";
import { Purchase } from "../../domain/purchase.aggregate";
import { PURCHASE_REPOSITORY, type PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { PurchaseNotFoundError, InvalidPurchaseLineError } from "../../domain/errors";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../../inventory/domain/ports/inventory-item-repository.port";

export interface EditPurchaseCommand {
  purchaseId: string;
  items?: { inventoryItemId: string; quantity: number; unitPrice: number }[];
  notes?: string | null;
}

@Injectable()
export class EditPurchaseHandler {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchases: PurchaseRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort
  ) {}

  async execute(command: EditPurchaseCommand): Promise<Purchase> {
    const purchase = await this.purchases.findById(command.purchaseId);
    if (!purchase) throw new PurchaseNotFoundError();

    let resolvedItems: { inventoryItemId: string; quantity: number; unit: string | null; unitPrice: number }[] | undefined;
    if (command.items) {
      resolvedItems = [];
      for (const item of command.items) {
        const invItem = await this.inventoryItems.findById(item.inventoryItemId);
        if (!invItem || invItem.itemType !== "raw") throw new InvalidPurchaseLineError();
        resolvedItems.push({ inventoryItemId: item.inventoryItemId, quantity: item.quantity, unit: invItem.unit, unitPrice: item.unitPrice });
      }
    }

    purchase.edit({ items: resolvedItems, notes: command.notes });
    await this.purchases.save(purchase);
    return purchase;
  }
}
