import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MenuItemsTab } from "./MenuItemsTab";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";

vi.mock("../../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const ITEMS = [
  {
    id: "item-new", kind: "item", categoryId: null, name: "شاورما", description: null, imageUrl: null, isBest: false,
    isActive: false, awaitingRecipe: true, hasRecipe: false,
    variants: [{ id: "v-new", label: "عادي", price: 50, talabatPrice: 60, hasRecipe: false }],
  },
  {
    id: "item-off", kind: "item", categoryId: null, name: "فول", description: null, imageUrl: null, isBest: false,
    isActive: false, awaitingRecipe: false, hasRecipe: true,
    variants: [{ id: "v-off", label: "عادي", price: 20, talabatPrice: 25, hasRecipe: true }],
  },
];

beforeEach(() => {
  apiMock.reset();
  apiMock.responses = { "/catalog/items": { items: ITEMS, total: 2, limit: 50, offset: 0 } };
});

describe("MenuItemsTab recipe tag", () => {
  it("tags an item without a recipe, links it to the recipes tab and blocks activating it", async () => {
    renderWithAuth(<MenuItemsTab canManage categories={[]} />, { user: seededUser("admin") });
    expect(await screen.findByText("شاورما")).toBeTruthy();

    const tag = screen.getByText("مفيش وصفة");
    expect(tag.closest("a")?.getAttribute("href")).toBe("/production?tab=recipe-links&item=item-new");

    const [blocked, allowed] = screen.getAllByRole("button", { name: "تفعيل" }) as HTMLButtonElement[];
    expect(blocked.disabled).toBe(true);
    expect(allowed.disabled).toBe(false);
  });
});
