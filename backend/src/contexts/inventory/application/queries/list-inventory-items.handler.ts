import { Inject, Injectable } from "@nestjs/common";
import { InventoryItem } from "../../domain/inventory-item.aggregate";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemListFilter,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListInventoryItemsHandler {
  constructor(@Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort) {}

  async execute(filter: InventoryItemListFilter = {}, page?: PageRequest): Promise<{ items: InventoryItem[]; total: number }> {
    return this.items.search(filter, page);
  }
}
