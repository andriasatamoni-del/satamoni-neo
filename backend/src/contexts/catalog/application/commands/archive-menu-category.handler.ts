import { Inject, Injectable } from "@nestjs/common";
import { MenuCategory } from "../../domain/menu-category.aggregate";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
import { MenuCategoryNotFoundError } from "../../domain/errors";

// "إلغاء/شيل" قسم = أرشفة: بيختفي من الكاشير والمتجر والبوت وقائمة الإعدادات، والأصناف والطلبات والتقارير القديمة مبتتلمسش
@Injectable()
export class ArchiveMenuCategoryHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  async execute(command: { categoryId: string }): Promise<MenuCategory> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new MenuCategoryNotFoundError();
    category.archive();
    await this.categories.save(category);
    return category;
  }
}

@Injectable()
export class RestoreMenuCategoryHandler {
  constructor(@Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort) {}

  // بيرجّع القسم موقوف: تفعيله بعد كده قرار صريح
  async execute(command: { categoryId: string }): Promise<MenuCategory> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new MenuCategoryNotFoundError();
    category.restore();
    await this.categories.save(category);
    return category;
  }
}
