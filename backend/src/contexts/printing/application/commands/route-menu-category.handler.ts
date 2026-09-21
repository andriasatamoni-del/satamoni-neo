import { Inject, Injectable } from "@nestjs/common";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../../catalog/domain/ports/menu-category-repository.port";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { MenuCategoryNotFoundError } from "../../../catalog/domain/errors";
import { KitchenStationNotFoundError } from "../../domain/errors";
import type { MenuCategory } from "../../../catalog/domain/menu-category.aggregate";

export interface RouteMenuCategoryCommand {
  categoryId: string;
  stationId: string | null;
}

// توجيه افتراضي لكل أصناف القسم (Settings > الطباعة > التوجيه) - توجيه مستوى الصنف بيغلبه لو متسجل
@Injectable()
export class RouteMenuCategoryHandler {
  constructor(
    @Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort,
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort
  ) {}

  async execute(command: RouteMenuCategoryCommand): Promise<MenuCategory> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new MenuCategoryNotFoundError();
    if (command.stationId) {
      const station = await this.stations.findById(command.stationId);
      if (!station) throw new KitchenStationNotFoundError();
    }
    category.setStationId(command.stationId);
    await this.categories.save(category);
    return category;
  }
}
