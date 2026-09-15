import { Recipe } from "../../../src/contexts/catalog/domain/recipe.aggregate";
import {
  EmptyRecipeIngredientsError,
  RecipeAssociationRequiredError,
  RecipeVersionNotEditableError,
  RecipeVersionNotFoundError,
  UnknownRecipeTypeError,
} from "../../../src/contexts/catalog/domain/errors";

describe("Recipe aggregate", () => {
  it("بيسجّل وصفة صنف مباع صح", () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "variant-1" });
    expect(recipe.recipeType).toBe("sellable_variant");
    expect(recipe.variantId).toBe("variant-1");
    expect(recipe.versions).toEqual([]);
  });

  it("بيرفض نوع وصفة مش معروف", () => {
    expect(() => Recipe.register({ recipeType: "ghost", variantId: "variant-1" })).toThrow(UnknownRecipeTypeError);
  });

  it("بيرفض وصفة صنف مباع من غير variantId، أو مع inventoryItemId كمان", () => {
    expect(() => Recipe.register({ recipeType: "sellable_variant" })).toThrow(RecipeAssociationRequiredError);
    expect(() =>
      Recipe.register({ recipeType: "sellable_variant", variantId: "v1", inventoryItemId: "i1" })
    ).toThrow(RecipeAssociationRequiredError);
  });

  it("بيرفض وصفة صنف مصنّع من غير inventoryItemId", () => {
    expect(() => Recipe.register({ recipeType: "manufactured_item" })).toThrow(RecipeAssociationRequiredError);
  });

  describe("createDraftVersion + addIngredient + activateVersion", () => {
    it("أول نسخة بترقيم 1، والنسخ اللي بعدها بتزوّد الرقم", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "v1" });
      const v1 = recipe.createDraftVersion({});
      const v2 = recipe.createDraftVersion({});
      expect(v1.versionNumber).toBe(1);
      expect(v2.versionNumber).toBe(2);
    });

    it("بيرفض تفعيل نسخة من غير مكوّنات", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "v1" });
      const version = recipe.createDraftVersion({});
      expect(() => recipe.activateVersion(version.id)).toThrow(EmptyRecipeIngredientsError);
    });

    it("تفعيل نسخة بيأرشف أي نسخة ACTIVE قديمة تلقائيًا - نسخة واحدة بس ACTIVE", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "v1" });
      const v1 = recipe.createDraftVersion({});
      recipe.addIngredient(v1.id, { ingredientItemId: "item-1", quantity: 2 });
      recipe.activateVersion(v1.id);
      expect(recipe.activeVersion?.id).toBe(v1.id);

      const v2 = recipe.createDraftVersion({});
      recipe.addIngredient(v2.id, { ingredientItemId: "item-1", quantity: 3 });
      recipe.activateVersion(v2.id);

      expect(recipe.activeVersion?.id).toBe(v2.id);
      expect(recipe.versions.find((v) => v.id === v1.id)?.status).toBe("ARCHIVED");
    });

    it("بيرفض إضافة مكوّن لنسخة مش DRAFT (ACTIVE/ARCHIVED)", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "v1" });
      const version = recipe.createDraftVersion({});
      recipe.addIngredient(version.id, { ingredientItemId: "item-1", quantity: 1 });
      recipe.activateVersion(version.id);
      expect(() => recipe.addIngredient(version.id, { ingredientItemId: "item-2", quantity: 1 })).toThrow(
        RecipeVersionNotEditableError
      );
    });

    it("بيرفض تفعيل نسخة مش موجودة", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: "v1" });
      expect(() => recipe.activateVersion("ghost-id")).toThrow(RecipeVersionNotFoundError);
    });
  });
});
