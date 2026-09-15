import { randomUUID } from "node:crypto";
import {
  EmptyRecipeIngredientsError,
  RecipeAssociationRequiredError,
  RecipeVersionNotEditableError,
  RecipeVersionNotFoundError,
  UnknownRecipeTypeError,
} from "./errors";

export const RECIPE_TYPES = ["sellable_variant", "manufactured_item"] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

// نسخة مبسّطة من دورة الاعتماد الستّة-حالات في الريبو القديم (DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/
// ARCHIVED/REJECTED) - مؤجّل تفعيل workflow الاعتماد الكامل لسلايس تاني (راجع تعليق migration
// 005_create_catalog_tables). القاعدة الأهم اللي متحفوظة من الأول: نسخة ACTIVE واحدة بس لكل وصفة.
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
  variantId: string | null;
  inventoryItemId: string | null;
  versions: RecipeVersion[];
  legacyRecipeId: number | null;
}

// Recipe (versioned) - نفس مفهوم recipes+recipe_versions+recipe_ingredients في الريبو القديم، بس
// versions/ingredients هنا entities تابعة لنفس aggregate (زي MenuItem.variants بالظبط)، مش جداول
// منفصلة بتتعدّل مباشرة. القاعدة الجوهرية المحفوظة: نسخة ACTIVE واحدة بس لكل وصفة في نفس اللحظة -
// activateVersion بيأرشف أي نسخة ACTIVE قديمة تلقائيًا قبل ما يفعّل الجديدة (نفس تأثير الـunique index
// الجزئي في الريبو القديم، بس كقاعدة دومين صريحة هنا). نسخة ACTIVE/ARCHIVED غير قابلة للتعديل - أي
// تغيير محتاج نسخة DRAFT جديدة (createNewVersion).
export class Recipe {
  private constructor(
    public readonly id: string,
    private props: RecipeProps
  ) {}

  static register(input: {
    recipeType: string;
    variantId?: string | null;
    inventoryItemId?: string | null;
    legacyRecipeId?: number | null;
  }): Recipe {
    if (!RECIPE_TYPES.includes(input.recipeType as RecipeType)) throw new UnknownRecipeTypeError(input.recipeType);
    const isVariantRecipe = input.recipeType === "sellable_variant";
    const hasVariant = !!input.variantId;
    const hasItem = !!input.inventoryItemId;
    if ((isVariantRecipe && (!hasVariant || hasItem)) || (!isVariantRecipe && (!hasItem || hasVariant))) {
      throw new RecipeAssociationRequiredError();
    }

    return new Recipe(randomUUID(), {
      recipeType: input.recipeType as RecipeType,
      variantId: input.variantId ?? null,
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

  // بيفعّل نسخة DRAFT: بيأرشف أي نسخة ACTIVE سابقة تلقائيًا (نسخة واحدة بس ACTIVE في نفس اللحظة)
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

  get activeVersion(): RecipeVersion | null {
    return this.props.versions.find((v) => v.status === "ACTIVE") ?? null;
  }

  private getVersionOrThrow(versionId: string): RecipeVersion {
    const version = this.props.versions.find((v) => v.id === versionId);
    if (!version) throw new RecipeVersionNotFoundError();
    return version;
  }

  get recipeType(): RecipeType { return this.props.recipeType; }
  get variantId(): string | null { return this.props.variantId; }
  get inventoryItemId(): string | null { return this.props.inventoryItemId; }
  get versions(): readonly RecipeVersion[] { return this.props.versions; }
  get legacyRecipeId(): number | null { return this.props.legacyRecipeId; }
}
