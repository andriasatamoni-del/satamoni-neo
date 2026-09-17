import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";
import { RecipeNotFoundError } from "../../../catalog/domain/errors";
import { RecipeHasNoActiveVersionError, RecipeNotManufacturedItemError } from "../../domain/errors";

export interface RegisterConversionOrderCommand {
  branchId: string;
  recipeId: string;
  plannedOutputQuantity: number;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class RegisterConversionOrderHandler {
  constructor(
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort
  ) {}

  async execute(command: RegisterConversionOrderCommand): Promise<ConversionOrder> {
    const recipe = await this.recipes.findById(command.recipeId);
    if (!recipe) throw new RecipeNotFoundError();
    if (recipe.recipeType !== "manufactured_item" || !recipe.inventoryItemId) throw new RecipeNotManufacturedItemError();
    const activeVersion = recipe.activeVersion;
    if (!activeVersion) throw new RecipeHasNoActiveVersionError();

    const order = ConversionOrder.register({
      branchId: command.branchId,
      recipeId: recipe.id,
      recipeVersionId: activeVersion.id,
      outputItemId: recipe.inventoryItemId,
      plannedOutputQuantity: command.plannedOutputQuantity,
      ingredients: activeVersion.ingredients.map((i) => ({ ingredientItemId: i.ingredientItemId, quantityPerUnit: i.quantity })),
      notes: command.notes,
      createdBy: command.createdBy,
    });
    await this.conversionOrders.save(order);
    return order;
  }
}
