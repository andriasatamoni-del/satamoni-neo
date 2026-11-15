import { randomUUID } from "node:crypto";
import {
  EmptyRecipeIngredientsError,
  RecipeAssociationRequiredError,
  RecipeNameRequiredError,
  RecipeVersionNotEditableError,
  RecipeVersionNotFoundError,
  UnknownRecipeTypeError,
} from "./errors";

export const RECIPE_TYPES = ["sellable_variant", "manufactured_item"] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export const RECIPE_VERSION_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type RecipeVersionStatus = (typeof RECIPE_VERSION_STATUSES)[number];

export interface RecipeIngredient {
  id: string;
  ingredientItemId: string;
  quantity: number;
  unit: string | null;
}

export interface RecipeVersion {
  id: string;
  versionNumber: number;
  status: RecipeVersionStatus;
  ingredients: RecipeIngredient[];
  createdBy: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
}

export interface RecipeProps {
  recipeType: RecipeType;
  name: string;
  inventoryItemId: string | null;
  versions: RecipeVersion[];
  legacyRecipeId: number | null;
}

export class Recipe {
  private constructor(
    public readonly id: string,
    private props: RecipeProps
  ) {}

  static register(input: {
    recipeType: string;
    name: string;
    inventoryItemId?: string | null;
    legacyRecipeId?: number | null;
  }): Recipe {
    if (!RECIPE_TYPES.includes(input.recipeType as RecipeType)) throw new UnknownRecipeTypeError(input.recipeType);
    const isManufactured = input.recipeType === "manufactured_item";
    if (isManufactured !== !!input.inventoryItemId) throw new RecipeAssociationRequiredError();

    return new Recipe(randomUUID(), {
      recipeType: input.recipeType as RecipeType,
      name: Recipe.cleanName(input.name),
      inventoryItemId: input.inventoryItemId ?? null,
      versions: [],
      legacyRecipeId: input.legacyRecipeId ?? null,
    });
  }

  static reconstitute(id: string, props: RecipeProps): Recipe {
    return new Recipe(id, props);
  }

  createDraftVersion(input: { createdBy?: string | null; legacyVersionId?: number }): RecipeVersion {
    const nextVersionNumber = this.props.versions.length
      ? Math.max(...this.props.versions.map((v) => v.versionNumber)) + 1
      : 1;
    const version: RecipeVersion = {
      id: randomUUID(),
      versionNumber: nextVersionNumber,
      status: "DRAFT",
      ingredients: [],
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      activatedAt: null,
      archivedAt: null,
    };
    this.props.versions.push(version);
    return version;
  }

  addIngredient(versionId: string, input: { ingredientItemId: string; quantity: number; unit?: string | null }): void {
    const version = this.getVersionOrThrow(versionId);
    if (version.status !== "DRAFT") throw new RecipeVersionNotEditableError();
    version.ingredients.push({
      id: randomUUID(),
      ingredientItemId: input.ingredientItemId,
      quantity: input.quantity,
      unit: input.unit ?? null,
    });
  }

  activateVersion(versionId: string): void {
    const version = this.getVersionOrThrow(versionId);
    if (version.status !== "DRAFT") throw new RecipeVersionNotEditableError();
    if (version.ingredients.length === 0) throw new EmptyRecipeIngredientsError();

    const now = new Date();
    const currentlyActive = this.props.versions.find((v) => v.status === "ACTIVE");
    if (currentlyActive) {
      currentlyActive.status = "ARCHIVED";
      currentlyActive.archivedAt = now;
    }
    version.status = "ACTIVE";
    version.activatedAt = now;
  }

  rename(name: string): void {
    this.props.name = Recipe.cleanName(name);
  }

  replaceIngredients(input: { ingredients: readonly { ingredientItemId: string; quantity: number; unit?: string | null }[]; createdBy?: string | null }): RecipeVersion {
    const version = this.createDraftVersion({ createdBy: input.createdBy });
    for (const ingredient of input.ingredients) this.addIngredient(version.id, ingredient);
    this.activateVersion(version.id);
    return version;
  }

  private static cleanName(name: string): string {
    const cleaned = name.trim();
    if (!cleaned) throw new RecipeNameRequiredError();
    return cleaned;
  }

  get activeVersion(): RecipeVersion | null {
    return this.props.versions.find((v) => v.status === "ACTIVE") ?? null;
  }

  private getVersionOrThrow(versionId: string): RecipeVersion {
    const version = this.props.versions.find((v) => v.id === versionId);
    if (!version) throw new RecipeVersionNotFoundError();
    return version;
  }

  get recipeType(): RecipeType { return this.props.recipeType; }
  get name(): string { return this.props.name; }
  get inventoryItemId(): string | null { return this.props.inventoryItemId; }
  get versions(): readonly RecipeVersion[] { return this.props.versions; }
  get legacyRecipeId(): number | null { return this.props.legacyRecipeId; }
}
