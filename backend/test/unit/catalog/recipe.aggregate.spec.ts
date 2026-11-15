import { Recipe } from "../../../src/contexts/catalog/domain/recipe.aggregate";
import {
  EmptyRecipeIngredientsError,
  RecipeAssociationRequiredError,
  RecipeNameRequiredError,
  RecipeVersionNotEditableError,
  RecipeVersionNotFoundError,
  UnknownRecipeTypeError,
} from "../../../src/contexts/catalog/domain/errors";

describe("Recipe aggregate", () => {
  it("registers a named menu recipe", () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", name: "  شاورما فراخ  " });
    expect(recipe.recipeType).toBe("sellable_variant");
    expect(recipe.name).toBe("شاورما فراخ");
    expect(recipe.inventoryItemId).toBeNull();
    expect(recipe.versions).toEqual([]);
  });

  it("rejects an unknown recipe type", () => {
    expect(() => Recipe.register({ recipeType: "ghost", name: "x" })).toThrow(UnknownRecipeTypeError);
  });

  it("requires a name", () => {
    expect(() => Recipe.register({ recipeType: "sellable_variant", name: "  " })).toThrow(RecipeNameRequiredError);
    const recipe = Recipe.register({ recipeType: "sellable_variant", name: "فول" });
    expect(() => recipe.rename(" ")).toThrow(RecipeNameRequiredError);
    recipe.rename("فول بالزيت");
    expect(recipe.name).toBe("فول بالزيت");
  });

  it("a menu recipe has no stock item, and a manufactured recipe needs one", () => {
    expect(() => Recipe.register({ recipeType: "sellable_variant", name: "x", inventoryItemId: "i1" })).toThrow(RecipeAssociationRequiredError);
    expect(() => Recipe.register({ recipeType: "manufactured_item", name: "x" })).toThrow(RecipeAssociationRequiredError);
    expect(Recipe.register({ recipeType: "manufactured_item", name: "عجينة", inventoryItemId: "i1" }).inventoryItemId).toBe("i1");
  });

  it("replaceIngredients creates and activates a new version", () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", name: "فول" });
    recipe.replaceIngredients({ ingredients: [{ ingredientItemId: "item-1", quantity: 1 }] });
    const second = recipe.replaceIngredients({ ingredients: [{ ingredientItemId: "item-1", quantity: 2 }] });
    expect(recipe.activeVersion?.id).toBe(second.id);
    expect(recipe.activeVersion?.versionNumber).toBe(2);
    expect(recipe.versions.filter((v) => v.status === "ACTIVE")).toHaveLength(1);
  });

  describe("createDraftVersion + addIngredient + activateVersion", () => {
    it("أول نسخة بترقيم 1، والنسخ اللي بعدها بتزوّد الرقم", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", name: "وصفة" });
      const v1 = recipe.createDraftVersion({});
      const v2 = recipe.createDraftVersion({});
      expect(v1.versionNumber).toBe(1);
      expect(v2.versionNumber).toBe(2);
    });

    it("بيرفض تفعيل نسخة من غير مكوّنات", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", name: "وصفة" });
      const version = recipe.createDraftVersion({});
      expect(() => recipe.activateVersion(version.id)).toThrow(EmptyRecipeIngredientsError);
    });

    it("تفعيل نسخة بيأرشف أي نسخة ACTIVE قديمة تلقائيًا - نسخة واحدة بس ACTIVE", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", name: "وصفة" });
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
      const recipe = Recipe.register({ recipeType: "sellable_variant", name: "وصفة" });
      const version = recipe.createDraftVersion({});
      recipe.addIngredient(version.id, { ingredientItemId: "item-1", quantity: 1 });
      recipe.activateVersion(version.id);
      expect(() => recipe.addIngredient(version.id, { ingredientItemId: "item-2", quantity: 1 })).toThrow(
        RecipeVersionNotEditableError
      );
    });

    it("بيرفض تفعيل نسخة مش موجودة", () => {
      const recipe = Recipe.register({ recipeType: "sellable_variant", name: "وصفة" });
      expect(() => recipe.activateVersion("ghost-id")).toThrow(RecipeVersionNotFoundError);
    });
  });
});
