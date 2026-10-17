import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemListFilter, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListMenuItemsHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(filter: MenuItemListFilter = {}, page?: PageRequest): Promise<{ items: MenuItem[]; total: number }> {
    return this.items.search(filter, page);
  }
}
