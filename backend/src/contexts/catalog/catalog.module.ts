import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CATALOG_LAYOUT_REPOSITORY, MENU_CATEGORY_REPOSITORY } from "./domain/ports/menu-category-repository.port";
import { MENU_ITEM_REPOSITORY } from "./domain/ports/menu-item-repository.port";
import { RECIPE_REPOSITORY } from "./domain/ports/recipe-repository.port";
import { COMBO_REPOSITORY } from "./domain/ports/combo-repository.port";
import { CatalogLayoutRepository, MenuCategoryRepository } from "./infrastructure/persistence/menu-category.repository";
import { MenuItemRepository } from "./infrastructure/persistence/menu-item.repository";
import { RecipeRepository } from "./infrastructure/persistence/recipe.repository";
import { ComboRepository } from "./infrastructure/persistence/combo.repository";
import { RegisterMenuCategoryHandler } from "./application/commands/register-menu-category.handler";
import { RegisterMenuItemHandler } from "./application/commands/register-menu-item.handler";
import { AddVariantHandler } from "./application/commands/add-variant.handler";
import { UpdateMenuCategoryHandler } from "./application/commands/update-menu-category.handler";
import { UpdateMenuItemHandler } from "./application/commands/update-menu-item.handler";
import { UpdateVariantHandler } from "./application/commands/update-variant.handler";
import { RegisterRecipeHandler } from "./application/commands/register-recipe.handler";
import { CreateRecipeVersionHandler } from "./application/commands/create-recipe-version.handler";
import { ActivateRecipeVersionHandler } from "./application/commands/activate-recipe-version.handler";
import { RegisterComboHandler } from "./application/commands/register-combo.handler";
import { UpdateComboHandler } from "./application/commands/update-combo.handler";
import { ReplaceComboItemsHandler } from "./application/commands/replace-combo-items.handler";
import { ArchiveMenuCategoryHandler, RestoreMenuCategoryHandler } from "./application/commands/archive-menu-category.handler";
import { ReorderMenuCategoriesHandler } from "./application/commands/reorder-menu-categories.handler";
import { GetCatalogLayoutHandler } from "./application/queries/get-catalog-layout.handler";
import { ListMenuCategoriesHandler } from "./application/queries/list-menu-categories.handler";
import { ListMenuItemsHandler } from "./application/queries/list-menu-items.handler";
import { GetRecipeByVariantHandler } from "./application/queries/get-recipe-by-variant.handler";
import { ListRecipesHandler } from "./application/queries/list-recipes.handler";
import { ListCombosHandler } from "./application/queries/list-combos.handler";
import { MenuPriceHistoryService } from "./application/services/menu-price-history.service";
import { CatalogController } from "./api/catalog.controller";
import { ExportMenuItemsQueryDto } from "./api/dto/export-menu-items-query.dto";
import { MenuItemsTabular } from "./application/tabular/menu-items.tabular";
import { TabularController } from "../../shared/tabular/tabular.controller";
import { PERMISSION } from "../identity-access/domain/permission";

@Module({
  imports: [IdentityAccessModule],
  controllers: [
    CatalogController,
    TabularController({
      path: "catalog/items",
      adapter: MenuItemsTabular,
      exportQuery: ExportMenuItemsQueryDto,
      permissions: {
        export: [PERMISSION.CATALOG_ITEMS_VIEW, PERMISSION.CATALOG_ITEMS_MANAGE],
        import: [PERMISSION.CATALOG_ITEMS_MANAGE],
      },
    }),
  ],
  providers: [
    { provide: MENU_CATEGORY_REPOSITORY, useClass: MenuCategoryRepository },
    { provide: CATALOG_LAYOUT_REPOSITORY, useClass: CatalogLayoutRepository },
    { provide: MENU_ITEM_REPOSITORY, useClass: MenuItemRepository },
    { provide: RECIPE_REPOSITORY, useClass: RecipeRepository },
    { provide: COMBO_REPOSITORY, useClass: ComboRepository },
    RegisterMenuCategoryHandler,
    RegisterMenuItemHandler,
    AddVariantHandler,
    UpdateMenuCategoryHandler,
    ArchiveMenuCategoryHandler,
    RestoreMenuCategoryHandler,
    ReorderMenuCategoriesHandler,
    GetCatalogLayoutHandler,
    UpdateMenuItemHandler,
    UpdateVariantHandler,
    RegisterRecipeHandler,
    CreateRecipeVersionHandler,
    ActivateRecipeVersionHandler,
    RegisterComboHandler,
    UpdateComboHandler,
    ReplaceComboItemsHandler,
    ListMenuCategoriesHandler,
    ListMenuItemsHandler,
    GetRecipeByVariantHandler,
    ListRecipesHandler,
    ListCombosHandler,
    MenuPriceHistoryService,
    MenuItemsTabular,
  ],
  exports: [MENU_CATEGORY_REPOSITORY, MENU_ITEM_REPOSITORY, RECIPE_REPOSITORY, COMBO_REPOSITORY],
})
export class CatalogModule {}
