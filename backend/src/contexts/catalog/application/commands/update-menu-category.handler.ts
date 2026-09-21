import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
import { MenuCategoryNotFoundError } from "../../domain/errors";

export interface UpdateMenuCategoryCommand {
  categoryId: string;
  name?: string;
  displayOrder?: number;
  menuGroup?: string;
  isActive?: boolean;
}

@Injectable()
export class UpdateMenuCategoryHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  async execute(command: UpdateMenuCategoryCommand): Promise<MenuCategory> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new MenuCategoryNotFoundError();

    category.updateDetails({ name: command.name, displayOrder: command.displayOrder, menuGroup: command.menuGroup });
    if (command.isActive === true) category.activate();
    if (command.isActive === false) category.deactivate();

    await this.categories.save(category);
    return category;
  }
}
