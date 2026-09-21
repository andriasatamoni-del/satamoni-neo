import { Inject, Injectable } from "@nestjs/common";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { MenuItemNotFoundError } from "../../../catalog/domain/errors";
import { KitchenStationNotFoundError } from "../../domain/errors";
import type { MenuItem } from "../../../catalog/domain/menu-item.aggregate";

export interface RouteMenuItemCommand {
  itemId: string;
  stationId: string | null;
}

// توجيه مستوى الصنف - بيغلب توجيه القسم؛ null = رجوع لتوجيه القسم
@Injectable()
export class RouteMenuItemHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort
  ) {}

  async execute(command: RouteMenuItemCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    if (command.stationId) {
      const station = await this.stations.findById(command.stationId);
      if (!station) throw new KitchenStationNotFoundError();
    }
    item.setStationId(command.stationId);
    await this.items.save(item);
    return item;
  }
}
