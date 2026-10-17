import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import {
  MENU_CATEGORY_REPOSITORY,
  type MenuCategoryListFilter,
  type MenuCategoryRepositoryPort,
} from "../../domain/ports/menu-category-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListMenuCategoriesHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  // الافتراضي: الأقسام غير المؤرشفة. archived=true بيرجّع المؤرشفة بس (لقائمة الاسترجاع في الإعدادات)
  async execute(filter: MenuCategoryListFilter = {}, page?: PageRequest): Promise<{ categories: MenuCategory[]; total: number }> {
    return this.categories.search({ ...filter, archived: filter.archived === true }, page);
  }
}
