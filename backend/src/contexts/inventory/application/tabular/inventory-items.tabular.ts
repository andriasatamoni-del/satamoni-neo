import { Inject, Injectable } from "@nestjs/common";
import { rowCreated, rowUnchanged, rowUpdated, type TabularAdapter, type TabularRowOutcome } from "../../../../shared/tabular/tabular-adapter";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemListFilter,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import { RegisterInventoryItemHandler } from "../commands/register-inventory-item.handler";
import { UpdateInventoryItemHandler } from "../commands/update-inventory-item.handler";
import { INVENTORY_ITEM_SHEET, inventoryItemSheetRow, type InventoryItemSheetRow } from "./inventory-item.sheet";

@Injectable()
export class InventoryItemsTabular implements TabularAdapter<typeof INVENTORY_ITEM_SHEET, InventoryItemListFilter> {
  readonly sheet = INVENTORY_ITEM_SHEET;

  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    private readonly registerItem: RegisterInventoryItemHandler,
    private readonly updateItem: UpdateInventoryItemHandler
  ) {}

  async exportRows(filter: InventoryItemListFilter): Promise<InventoryItemSheetRow[]> {
    const { items } = await this.items.search(filter);
    return items.map(inventoryItemSheetRow);
  }

  async importRow(row: InventoryItemSheetRow): Promise<TabularRowOutcome> {
    const existing = await this.items.findByName(row.name.trim());
    if (!existing) {
      const item = await this.registerItem.execute({
        name: row.name,
        unit: row.unit,
        unitCost: row.unitCost,
        itemType: row.itemType ?? undefined,
        negativeStockPolicy: row.negativeStockPolicy ?? undefined,
      });
      return rowCreated(item.id);
    }
    const { changed } = await this.updateItem.execute({
      itemId: existing.id,
      unit: row.unit,
      itemType: row.itemType ?? undefined,
      unitCost: row.unitCost,
      negativeStockPolicy: row.negativeStockPolicy ?? undefined,
    });
    return changed ? rowUpdated(existing.id) : rowUnchanged(existing.id);
  }
}
