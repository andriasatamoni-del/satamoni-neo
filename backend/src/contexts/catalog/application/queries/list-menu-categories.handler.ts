import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import {
  MENU_CATEGORY_REPOSITORY,
  type MenuCategoryRepositoryPort,
} from "../../domain/ports/menu-category-repository.port";

@Injectable()
export class ListMenuCategoriesHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  async execute(): Promise<MenuCategory[]> {
    return this.categories.list();
  }
}
