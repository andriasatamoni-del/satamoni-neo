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
    // القسم الجديد بيتحط في الآخر (مش الأول): الترتيب بقى قابل للتحكم، فمنفاجئش حد بقسم جديد ظاهر قبل الكل
    let displayOrder = command.displayOrder;
    if (displayOrder === undefined) {
      const existing = await this.categories.list({ archived: false });
      displayOrder = existing.reduce((max, c) => Math.max(max, c.displayOrder), -1) + 1;
    }
    const category = MenuCategory.register({ ...command, displayOrder });
    await this.categories.save(category);
    return category;
  }
}
