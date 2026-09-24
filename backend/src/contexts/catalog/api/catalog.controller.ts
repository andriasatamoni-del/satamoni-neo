import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterMenuCategoryHandler } from "../application/commands/register-menu-category.handler";
import { RegisterMenuItemHandler } from "../application/commands/register-menu-item.handler";
import { AddVariantHandler } from "../application/commands/add-variant.handler";
import { UpdateMenuCategoryHandler } from "../application/commands/update-menu-category.handler";
import { UpdateMenuItemHandler } from "../application/commands/update-menu-item.handler";
import { UpdateVariantHandler } from "../application/commands/update-variant.handler";
import { AddModifierHandler } from "../application/commands/add-modifier.handler";
import { UpdateModifierHandler } from "../application/commands/update-modifier.handler";
import { SetModifierVariantPriceHandler } from "../application/commands/set-modifier-variant-price.handler";
import { ClearModifierVariantPriceHandler } from "../application/commands/clear-modifier-variant-price.handler";
import { RegisterRecipeHandler } from "../application/commands/register-recipe.handler";
import { CreateRecipeVersionHandler } from "../application/commands/create-recipe-version.handler";
import { ActivateRecipeVersionHandler } from "../application/commands/activate-recipe-version.handler";
import { RegisterComboHandler } from "../application/commands/register-combo.handler";
import { UpdateComboHandler } from "../application/commands/update-combo.handler";
import { ReplaceComboItemsHandler } from "../application/commands/replace-combo-items.handler";
import { ListMenuCategoriesHandler } from "../application/queries/list-menu-categories.handler";
import { ListMenuItemsHandler } from "../application/queries/list-menu-items.handler";
import { GetRecipeByVariantHandler } from "../application/queries/get-recipe-by-variant.handler";
import { ListRecipesHandler } from "../application/queries/list-recipes.handler";
import { ListCombosHandler } from "../application/queries/list-combos.handler";
import { RegisterMenuCategoryDto } from "./dto/register-menu-category.dto";
import { RegisterMenuItemDto } from "./dto/register-menu-item.dto";
import { AddVariantDto } from "./dto/add-variant.dto";
import { UpdateMenuCategoryDto } from "./dto/update-menu-category.dto";
import { UpdateMenuItemDto } from "./dto/update-menu-item.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { AddModifierDto } from "./dto/add-modifier.dto";
import { UpdateModifierDto } from "./dto/update-modifier.dto";
import { SetModifierVariantPriceDto } from "./dto/set-modifier-variant-price.dto";
import { RegisterRecipeDto } from "./dto/register-recipe.dto";
import { CreateRecipeVersionDto } from "./dto/create-recipe-version.dto";
import { RegisterComboDto } from "./dto/register-combo.dto";
import { UpdateComboDto } from "./dto/update-combo.dto";
import { ReplaceComboItemsDto } from "./dto/replace-combo-items.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { CatalogDomainErrorFilter } from "./filters/domain-error.filter";
import type { MenuCategory } from "../domain/menu-category.aggregate";
import type { MenuItem } from "../domain/menu-item.aggregate";
import type { Recipe } from "../domain/recipe.aggregate";
import type { Combo } from "../domain/combo.aggregate";

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
    private readonly addModifier: AddModifierHandler,
    private readonly updateModifier: UpdateModifierHandler,
    private readonly setModifierVariantPrice: SetModifierVariantPriceHandler,
    private readonly clearModifierVariantPrice: ClearModifierVariantPriceHandler,
    private readonly registerRecipe: RegisterRecipeHandler,
    private readonly createRecipeVersion: CreateRecipeVersionHandler,
    private readonly activateRecipeVersion: ActivateRecipeVersionHandler,
    private readonly listCategories: ListMenuCategoriesHandler,
    private readonly listItems: ListMenuItemsHandler,
    private readonly getRecipeByVariant: GetRecipeByVariantHandler,
    private readonly listRecipes: ListRecipesHandler,
    private readonly registerCombo: RegisterComboHandler,
    private readonly updateCombo: UpdateComboHandler,
    private readonly replaceComboItems: ReplaceComboItemsHandler,
    private readonly listCombos: ListCombosHandler
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

  @Post("items/:id/modifiers")
  @RequirePermission("catalog.items.manage")
  async createModifier(@Param("id") id: string, @Body() dto: AddModifierDto) {
    const { item } = await this.addModifier.execute({ itemId: id, ...dto });
    return toPublicItem(item);
  }

  @Patch("items/:id/modifiers/:modifierId")
  @RequirePermission("catalog.items.manage")
  async updateModifierHandler(@Param("id") id: string, @Param("modifierId") modifierId: string, @Body() dto: UpdateModifierDto) {
    return toPublicItem(await this.updateModifier.execute({ itemId: id, modifierId, ...dto }));
  }

  @Put("items/:id/modifiers/:modifierId/variant-prices/:variantId")
  @RequirePermission("catalog.items.manage")
  async setModifierVariantPriceRoute(
    @Param("id") id: string,
    @Param("modifierId") modifierId: string,
    @Param("variantId") variantId: string,
    @Body() dto: SetModifierVariantPriceDto
  ) {
    return toPublicItem(await this.setModifierVariantPrice.execute({ itemId: id, modifierId, variantId, ...dto }));
  }

  @Delete("items/:id/modifiers/:modifierId/variant-prices/:variantId")
  @RequirePermission("catalog.items.manage")
  async clearModifierVariantPriceRoute(
    @Param("id") id: string,
    @Param("modifierId") modifierId: string,
    @Param("variantId") variantId: string
  ) {
    return toPublicItem(await this.clearModifierVariantPrice.execute({ itemId: id, modifierId, variantId }));
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

  // العروض النشطة بس - نفس GET /api/combos بالريبو القديم (لأي حد يقدر يسجّل/يشوف طلبات)
  @Get("combos")
  @RequirePermission("catalog.items.view", "catalog.items.manage")
  async combos() {
    return (await this.listCombos.execute({ activeOnly: true })).map(toPublicCombo);
  }

  // كل العروض (نشطة وغير نشطة) - نفس GET /api/combos/all بالريبو القديم (لشاشة الإدارة بس)
  @Get("combos/all")
  @RequirePermission("catalog.items.manage")
  async allCombos() {
    return (await this.listCombos.execute()).map(toPublicCombo);
  }

  @Post("combos")
  @RequirePermission("catalog.items.manage")
  async createCombo(@Body() dto: RegisterComboDto) {
    return toPublicCombo(await this.registerCombo.execute(dto));
  }

  @Patch("combos/:id")
  @RequirePermission("catalog.items.manage")
  async updateComboHandler(@Param("id") id: string, @Body() dto: UpdateComboDto) {
    return toPublicCombo(await this.updateCombo.execute({ comboId: id, ...dto }));
  }

  @Put("combos/:id/items")
  @RequirePermission("catalog.items.manage")
  async replaceComboItemsHandler(@Param("id") id: string, @Body() dto: ReplaceComboItemsDto) {
    return toPublicCombo(await this.replaceComboItems.execute({ comboId: id, items: dto.items }));
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
    modifiers: item.modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      priceDelta: m.priceDelta,
      isActive: m.isActive,
      variantPrices: m.variantPrices.map((vp) => ({ variantId: vp.variantId, priceDelta: vp.priceDelta })),
    })),
  };
}

function toPublicCombo(combo: Combo) {
  return {
    id: combo.id,
    name: combo.name,
    price: combo.price,
    isActive: combo.isActive,
    items: combo.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
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
