import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MenuRecipesTab, type MenuRecipe, type MenuRecipeItem } from "./MenuRecipesTab";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";
import { apiRequest } from "../../shared/api/client";

vi.mock("../../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const RECIPES: MenuRecipe[] = [
  {
    id: "r-beans",
    name: "وصفة فول",
    activeVersion: { versionNumber: 1, ingredients: [{ ingredientItemId: "ing-1", name: "فول مدمس", unit: "كيلو", quantity: 0.1 }] },
    usedBy: [
      { itemId: "item-ok", itemName: "فول", variantId: "v-ok", label: "عادي" },
      { itemId: "item-ok2", itemName: "فول بالبيض", variantId: "v-ok2", label: "عادي" },
    ],
  },
];

const ITEMS: MenuRecipeItem[] = [
  {
    id: "item-new", name: "شاورما", kind: "item", categoryId: "c1", categoryName: "سندوتشات",
    isActive: false, awaitingRecipe: true, hasRecipe: false,
    variants: [{ id: "v-new", label: "عادي", recipeId: null, recipeName: null, ready: false }],
  },
  {
    id: "item-ok", name: "فول", kind: "item", categoryId: "c1", categoryName: "سندوتشات",
    isActive: true, awaitingRecipe: false, hasRecipe: true,
    variants: [{ id: "v-ok", label: "عادي", recipeId: "r-beans", recipeName: "وصفة فول", ready: true }],
  },
];

const INGREDIENTS = [{ id: "ing-1", name: "فول مدمس", unit: "كيلو" }, { id: "ing-2", name: "فراخ", unit: "كيلو" }];

beforeEach(() => {
  apiMock.reset();
  vi.mocked(apiRequest).mockClear();
  apiMock.responses = {
    "/catalog/menu-recipes/recipes": { items: RECIPES, total: 1, limit: 10, offset: 0 },
    "/catalog/menu-recipes/items": { items: ITEMS, total: 2, limit: 10, offset: 0 },
    "/catalog/menu-recipes/options": [{ id: "r-beans", name: "وصفة فول", ready: true }],
  };
});

function renderTab(props: { canManageRecipes?: boolean } = {}) {
  return renderWithAuth(
    <MenuRecipesTab ingredients={INGREDIENTS} canManageRecipes={props.canManageRecipes ?? true} />,
    { user: seededUser("admin"), route: "/production?tab=recipes" }
  );
}

const calledPaths = () => vi.mocked(apiRequest).mock.calls.map(([path]) => path as string);

describe("MenuRecipesTab", () => {
  it("loads the library a page at a time and shows the sizes using each recipe", async () => {
    renderTab();
    expect(await screen.findByText("فول مدمس 0.1 كيلو")).toBeTruthy();
    expect(screen.getByText("فول (عادي)، فول بالبيض (عادي)")).toBeTruthy();
    expect(calledPaths()).toContain("/catalog/menu-recipes/recipes?limit=10&offset=0&paginate=1");
  });

  it("moves to the next page of recipes", async () => {
    apiMock.responses["/catalog/menu-recipes/recipes"] = { items: RECIPES, total: 25, limit: 10, offset: 0 };
    renderTab();
    await screen.findByText("فول مدمس 0.1 كيلو");
    const next = (screen.getAllByRole("button", { name: /التالي/ }) as HTMLButtonElement[]).find((b) => !b.disabled)!;
    fireEvent.click(next);
    await waitFor(() => expect(calledPaths()).toContain("/catalog/menu-recipes/recipes?limit=10&offset=10&paginate=1"));
  });

  it("creates a named recipe with its ingredients", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "وصفة جديدة" }));
    fireEvent.change(screen.getByLabelText("اسم الوصفة"), { target: { value: "شاورما فراخ" } });
    fireEvent.change(screen.getByLabelText("المكوّن"), { target: { value: "ing-2" } });
    fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الوصفة" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/catalog/recipes", {
        method: "POST",
        body: { recipeType: "sellable_variant", name: "شاورما فراخ", ingredients: [{ ingredientItemId: "ing-2", quantity: 0.25 }] },
      })
    );
  });

  it("is read only without the permission", async () => {
    renderTab({ canManageRecipes: false });
    expect(await screen.findByText("وصفة فول")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "وصفة جديدة" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تعديل" })).toBeNull();
    expect(calledPaths().some((p) => p.startsWith("/catalog/menu-recipes/items"))).toBe(false);
  });
});
