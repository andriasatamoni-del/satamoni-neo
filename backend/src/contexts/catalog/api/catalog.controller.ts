import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterMenuCategoryHandler } from "../application/commands/register-menu-category.handler";
import { RegisterMenuItemHandler } from "../application/commands/register-menu-item.handler";
import { AddVariantHandler } from "../application/commands/add-variant.handler";
import { UpdateMenuCategoryHandler } from "../application/commands/update-menu-category.handler";
import { UpdateMenuItemHandler } from "../application/commands/update-menu-item.handler";
import { UpdateVariantHandler } from "../application/commands/update-variant.handler";
import { RegisterRecipeHandler } from "../application/commands/register-recipe.handler";
import { CreateRecipeVersionHandler } from "../application/commands/create-recipe-version.handler";
import { ActivateRecipeVersionHandler } from "../application/commands/activate-recipe-version.handler";
import { ListMenuCategoriesHandler } from "../application/queries/list-menu-categories.handler";
import { ListMenuItemsHandler } from "../application/queries/list-menu-items.handler";
import { GetRecipeByVariantHandler } from "../application/queries/get-recipe-by-variant.handler";
import { ListRecipesHandler } from "../application/queries/list-recipes.handler";
import { RegisterMenuCategoryDto } from "./dto/register-menu-category.dto";
import { RegisterMenuItemDto } from "./dto/register-menu-item.dto";
import { AddVariantDto } from "./dto/add-variant.dto";
import { UpdateMenuCategoryDto } from "./dto/update-menu-category.dto";
import { UpdateMenuItemDto } from "./dto/update-menu-item.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { RegisterRecipeDto } from "./dto/register-recipe.dto";
import { CreateRecipeVersionDto } from "./dto/create-recipe-version.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { CatalogDomainErrorFilter } from "./filters/domain-error.filter";
import type { MenuCategory } from "../domain/menu-category.aggregate";
import type { MenuItem } from "../domain/menu-item.aggregate";
import type { Recipe } from "../domain/recipe.aggregate";

@Controller("catalog")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(CatalogDomainErrorFilter)
export class CatalogController {
  constructor(
    private readonly registerCategory: RegisterMenuCategoryHandler,
    private readonly registerItem: RegisterMenuItemHandler,
    private readonly addVariant: AddVariantHandler,
    private readonly updateCategory: UpdateMenuCategoryHandler,
    private readonly updateItem: UpdateMenuItemHandler,
    private readonly updateVariant: UpdateVariantHandler,
    private readonly registerRecipe: RegisterRecipeHandler,
    private readonly createRecipeVersion: CreateRecipeVersionHandler,
    private readonly activateRecipeVersion: ActivateRecipeVersionHandler,
    private readonly listCategories: ListMenuCategoriesHandler,
    private readonly listItems: ListMenuItemsHandler,
    private readonly getRecipeByVariant: GetRecipeByVariantHandler,
    private readonly listRecipes: ListRecipesHandler
  ) {}

  @Get("recipes")
  @RequirePermission("catalog.items.view", "catalog.recipes.manage")
  async recipes(@Query("recipeType") recipeType?: string) {
    return (await this.listRecipes.execute({ recipeType })).map(toPublicRecipe);
  }

  @Get("categories")
  @RequirePermission("catalog.items.view", "catalog.items.manage")
  async categories() {
    return (await this.listCategories.execute()).map(toPublicCategory);
  }

  @Post("categories")
  @RequirePermission("catalog.items.manage")
  async createCategory(@Body() dto: RegisterMenuCategoryDto) {
    return toPublicCategory(await this.registerCategory.execute(dto));
  }

  @Patch("categories/:id")
  @RequirePermission("catalog.items.manage")
  async updateCategoryHandler(@Param("id") id: string, @Body() dto: UpdateMenuCategoryDto) {
    return toPublicCategory(await this.updateCategory.execute({ categoryId: id, ...dto }));
  }

  @Get("items")
  @RequirePermission("catalog.items.view", "catalog.items.manage")
  async items() {
    return (await this.listItems.execute()).map(toPublicItem);
  }

  @Post("items")
  @RequirePermission("catalog.items.manage")
  async createItem(@Body() dto: RegisterMenuItemDto) {
    return toPublicItem(await this.registerItem.execute(dto));
  }

  @Patch("items/:id")
  @RequirePermission("catalog.items.manage")
  async updateItemHandler(@Param("id") id: string, @Body() dto: UpdateMenuItemDto) {
    return toPublicItem(await this.updateItem.execute({ itemId: id, ...dto }));
  }

  @Post("items/:id/variants")
  @RequirePermission("catalog.items.manage")
  async createVariant(@Param("id") id: string, @Body() dto: AddVariantDto) {
    const { item } = await this.addVariant.execute({ itemId: id, ...dto });
    return toPublicItem(item);
  }

  @Patch("items/:id/variants/:variantId")
  @RequirePermission("catalog.items.manage")
  async updateVariantHandler(@Param("id") id: string, @Param("variantId") variantId: string, @Body() dto: UpdateVariantDto) {
    return toPublicItem(await this.updateVariant.execute({ itemId: id, variantId, ...dto }));
  }

  @Post("recipes")
  @RequirePermission("catalog.recipes.manage")
  async createRecipe(@Body() dto: RegisterRecipeDto) {
    return toPublicRecipe(await this.registerRecipe.execute(dto));
  }

  @Post("recipes/:id/versions")
  @RequirePermission("catalog.recipes.manage")
  async createVersion(
    @Param("id") id: string,
    @Body() dto: CreateRecipeVersionDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const { recipe } = await this.createRecipeVersion.execute({
      recipeId: id,
      ingredients: dto.ingredients,
      createdBy: req.user.id,
    });
    return toPublicRecipe(recipe);
  }

  @Post("recipes/:id/versions/:versionId/activate")
  @RequirePermission("catalog.recipes.manage")
  async activateVersion(@Param("id") id: string, @Param("versionId") versionId: string) {
    return toPublicRecipe(await this.activateRecipeVersion.execute({ recipeId: id, versionId }));
  }

  @Get("variants/:variantId/recipe")
  @RequirePermission("catalog.items.view", "catalog.recipes.manage")
  async recipeByVariant(@Param("variantId") variantId: string) {
    const recipe = await this.getRecipeByVariant.execute(variantId);
    return recipe ? toPublicRecipe(recipe) : null;
  }
}

function toPublicCategory(category: MenuCategory) {
  return {
    id: category.id,
    name: category.name,
    displayOrder: category.displayOrder,
    menuGroup: category.menuGroup,
    isActive: category.isActive,
  };
}

function toPublicItem(item: MenuItem) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    isBest: item.isBest,
    isActive: item.isActive,
    variants: item.variants.map((v) => ({ id: v.id, label: v.label, price: v.price, talabatPrice: v.talabatPrice })),
  };
}

function toPublicRecipe(recipe: Recipe) {
  return {
    id: recipe.id,
    recipeType: recipe.recipeType,
    variantId: recipe.variantId,
    inventoryItemId: recipe.inventoryItemId,
    versions: recipe.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      ingredients: v.ingredients.map((i) => ({ ingredientItemId: i.ingredientItemId, quantity: i.quantity, unit: i.unit })),
    })),
  };
}
