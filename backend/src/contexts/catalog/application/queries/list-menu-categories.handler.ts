import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import {
  MENU_CATEGORY_REPOSITORY,
  type MenuCategoryRepositoryPort,
} from "../../domain/ports/menu-category-repository.port";

@Injectable()
export class ListMenuCategoriesHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  // الافتراضي: الأقسام غير المؤرشفة. archived=true بيرجّع المؤرشفة بس (لقائمة الاسترجاع في الإعدادات)
  async execute(opts: { archived?: boolean } = {}): Promise<MenuCategory[]> {
    return this.categories.list({ archived: opts.archived === true });
  }
}
