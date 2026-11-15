import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MenuRecipeItem } from "./MenuRecipesTab";
import { RecipeLinksTab } from "./RecipeLinksTab";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";
import { apiRequest } from "../../shared/api/client";

vi.mock("../../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

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

beforeEach(() => {
  apiMock.reset();
  vi.mocked(apiRequest).mockClear();
  apiMock.responses = {
    "/catalog/menu-recipes/items": { items: ITEMS, total: 2, limit: 10, offset: 0 },
    "/catalog/menu-recipes/options": [{ id: "r-beans", name: "وصفة فول", ready: true }],
  };
});

function renderTab(props: { canAssign?: boolean; highlightItemId?: string } = {}) {
  return renderWithAuth(<RecipeLinksTab canAssign={props.canAssign ?? true} highlightItemId={props.highlightItemId} />, {
    user: seededUser("admin"),
    route: "/production?tab=recipe-links",
  });
}

const calledPaths = () => vi.mocked(apiRequest).mock.calls.map(([path]) => path as string);

describe("RecipeLinksTab", () => {
  it("loads the menu items a page at a time", async () => {
    renderTab();
    expect(await screen.findByText("شاورما")).toBeTruthy();
    expect(calledPaths()).toContain("/catalog/menu-recipes/items?limit=10&offset=0&paginate=1");
    expect(screen.getByText("2 صنف من غير وصفة")).toBeTruthy();
  });

  it("sends the search and the missing-recipe filter to the server", async () => {
    renderTab();
    await screen.findByText("شاورما");
    fireEvent.change(screen.getByLabelText("عرض الأصناف"), { target: { value: "missing" } });
    await waitFor(() => expect(calledPaths()).toContain("/catalog/menu-recipes/items?missing=1&limit=10&offset=0&paginate=1"));
    fireEvent.change(screen.getByLabelText("بحث في الأصناف"), { target: { value: "شاور" } });
    await waitFor(() => expect(calledPaths().some((p) => p.startsWith("/catalog/menu-recipes/items?q="))).toBe(true));
  });

  it("assigns a recipe to a size with PUT", async () => {
    renderTab();
    const select = await screen.findByLabelText("وصفة شاورما عادي");
    await waitFor(() => expect(screen.getAllByRole("option", { name: "وصفة فول" }).length).toBeGreaterThan(0));
    fireEvent.change(select, { target: { value: "r-beans" } });
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/catalog/variants/v-new/recipe", { method: "PUT", body: { recipeId: "r-beans" } })
    );
  });

  it("shows only the linked item with a way back to all items", async () => {
    renderTab({ highlightItemId: "item-new" });
    expect(await screen.findByText("بتعرض الصنف اللي اخترته بس.")).toBeTruthy();
    expect(calledPaths().some((p) => p.startsWith("/catalog/menu-recipes/items?") && p.includes("itemId=item-new"))).toBe(true);
  });

  it("is read only without the permission", async () => {
    renderTab({ canAssign: false });
    expect(await screen.findByText("شاورما")).toBeTruthy();
    expect(screen.queryByLabelText("وصفة شاورما عادي")).toBeNull();
    expect(screen.getByText("وصفة فول")).toBeTruthy();
    expect(calledPaths()).not.toContain("/catalog/menu-recipes/options");
  });
});
