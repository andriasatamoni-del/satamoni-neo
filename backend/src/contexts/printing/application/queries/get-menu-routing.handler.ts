import { Inject, Injectable } from "@nestjs/common";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../../catalog/domain/ports/menu-category-repository.port";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";

export interface MenuRoutingCategoryView {
  categoryId: string;
  categoryName: string;
  categoryStationId: string | null;
  items: { itemId: string; itemName: string; itemStationId: string | null }[];
}

// المنيو كله مع القسم/الصنف وأي محطة متسجلة لكل واحد - شاشة التوجيه (Settings > الطباعة > التوجيه)
// محتاجاها عشان تعرض كل صنف/قسم في المنيو مع اختيار المحطة جنبه
@Injectable()
export class GetMenuRoutingHandler {
  constructor(
    @Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort
  ) {}

  async execute(): Promise<MenuRoutingCategoryView[]> {
    const allCategories = await this.categories.list();
    const allItems = await this.items.list();
    return allCategories
      .filter((c) => c.isActive)
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        categoryStationId: category.stationId,
        items: allItems
          .filter((i) => i.categoryId === category.id && i.isActive)
          .map((i) => ({ itemId: i.id, itemName: i.name, itemStationId: i.stationId })),
      }));
  }
}
