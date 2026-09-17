import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { MENU_CATEGORY_REPOSITORY } from "./domain/ports/menu-category-repository.port";
import { MENU_ITEM_REPOSITORY } from "./domain/ports/menu-item-repository.port";
import { RECIPE_REPOSITORY } from "./domain/ports/recipe-repository.port";
import { KyselyMenuCategoryRepository } from "./infrastructure/persistence/kysely-menu-category.repository";
import { KyselyMenuItemRepository } from "./infrastructure/persistence/kysely-menu-item.repository";
import { KyselyRecipeRepository } from "./infrastructure/persistence/kysely-recipe.repository";
import { RegisterMenuCategoryHandler } from "./application/commands/register-menu-category.handler";
import { RegisterMenuItemHandler } from "./application/commands/register-menu-item.handler";
import { AddVariantHandler } from "./application/commands/add-variant.handler";
import { RegisterRecipeHandler } from "./application/commands/register-recipe.handler";
import { CreateRecipeVersionHandler } from "./application/commands/create-recipe-version.handler";
import { ActivateRecipeVersionHandler } from "./application/commands/activate-recipe-version.handler";
import { ListMenuCategoriesHandler } from "./application/queries/list-menu-categories.handler";
import { ListMenuItemsHandler } from "./application/queries/list-menu-items.handler";
import { GetRecipeByVariantHandler } from "./application/queries/get-recipe-by-variant.handler";
import { ListRecipesHandler } from "./application/queries/list-recipes.handler";
import { CatalogController } from "./api/catalog.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [CatalogController],
  providers: [
    { provide: MENU_CATEGORY_REPOSITORY, useClass: KyselyMenuCategoryRepository },
    { provide: MENU_ITEM_REPOSITORY, useClass: KyselyMenuItemRepository },
    { provide: RECIPE_REPOSITORY, useClass: KyselyRecipeRepository },
    RegisterMenuCategoryHandler,
    RegisterMenuItemHandler,
    AddVariantHandler,
    RegisterRecipeHandler,
    CreateRecipeVersionHandler,
    ActivateRecipeVersionHandler,
    ListMenuCategoriesHandler,
    ListMenuItemsHandler,
    GetRecipeByVariantHandler,
    ListRecipesHandler,
  ],
  exports: [MENU_CATEGORY_REPOSITORY, MENU_ITEM_REPOSITORY, RECIPE_REPOSITORY],
})
export class CatalogModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "catalog",
      groupLabel: "قائمة الطعام والوصفات",
      permissions: [
        { key: "catalog.items.view", label: "رؤية قائمة الطعام" },
        { key: "catalog.items.manage", label: "إدارة قائمة الطعام" },
        { key: "catalog.recipes.manage", label: "إدارة الوصفات" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["catalog.items.view"]);
    this.permissions.setRoleDefaults("cashier", ["catalog.items.view"]);
    this.permissions.setRoleDefaults("callcenter", ["catalog.items.view"]);
  }
}
