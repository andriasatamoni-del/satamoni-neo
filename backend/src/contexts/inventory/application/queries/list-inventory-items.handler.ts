import { Inject, Injectable } from "@nestjs/common";
import { InventoryItem } from "../../domain/inventory-item.aggregate";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";

@Injectable()
export class ListInventoryItemsHandler {
  constructor(@Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort) {}

  async execute(): Promise<InventoryItem[]> {
    return this.items.list();
  }
}
