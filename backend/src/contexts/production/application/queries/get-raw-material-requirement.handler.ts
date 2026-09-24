import { Inject, Injectable } from "@nestjs/common";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../../inventory/domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../../inventory/domain/ports/stock-movement-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";

export interface GetRawMaterialRequirementQuery {
  ckBranchId: string;
  inventoryItemId: string;
  quantity: number;
}

export interface RawMaterialRow {
  inventoryItemId: string;
  itemName: string | null;
  unit: string | null;
  required: number;
  available: number;
  shortage: number;
}

export interface RawMaterialRequirementResult {
  hasRecipe: boolean;
  raw: RawMaterialRow[];
}

// احتياج الخامات لكمية مطلوب تصنيعها من صنف معيّن - نفس منطق computeRawMaterialRequirement بالريبو
// القديم، بس بدون تفجير وصفة متداخل (recipe explosion) عن قصد - راجع تعليق ConversionOrder.register:
// لو مكوّن نفسه "مصنّع"، لازم يتصنّع فعليًا بـConversionOrder خاص بيه الأول، مش تفجير نظري متداخل
@Injectable()
export class GetRawMaterialRequirementHandler {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort
  ) {}

  async execute(query: GetRawMaterialRequirementQuery): Promise<RawMaterialRequirementResult> {
    const recipe = await this.recipes.findByInventoryItemId(query.inventoryItemId);
    const activeVersion = recipe?.activeVersion ?? null;
    if (!activeVersion) return { hasRecipe: false, raw: [] };

    const rows: RawMaterialRow[] = [];
    for (const ingredient of activeVersion.ingredients) {
      const required = ingredient.quantity * query.quantity;
      const available = await this.movements.getBalance(query.ckBranchId, ingredient.ingredientItemId);
      const item = await this.items.findById(ingredient.ingredientItemId);
      rows.push({
        inventoryItemId: ingredient.ingredientItemId,
        itemName: item?.name ?? null,
        unit: item?.unit ?? ingredient.unit,
        required,
        available,
        shortage: Math.max(0, required - available),
      });
    }
    rows.sort((a, b) => b.shortage - a.shortage);
    return { hasRecipe: true, raw: rows };
  }
}
