import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import {
  MENU_CATEGORY_REPOSITORY,
  type MenuCategoryRepositoryPort,
} from "../../domain/ports/menu-category-repository.port";

export interface RegisterMenuCategoryCommand {
  name: string;
  displayOrder?: number;
  menuGroup?: string;
}

@Injectable()
export class RegisterMenuCategoryHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  async execute(command: RegisterMenuCategoryCommand): Promise<MenuCategory> {
    const category = MenuCategory.register(command);
    await this.categories.save(category);
    return category;
  }
}
