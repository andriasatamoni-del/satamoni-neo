import { describe, expect, it } from "vitest";
import { cartLineTotal, itemPriceLabel, needsOptionPicker, sellableAddons, sellableVariants } from "./menuPricing";
import type { CartLine, MenuItem, MenuItemVariant } from "./posTypes";

function item(variants: MenuItemVariant[]): MenuItem {
  return { id: "i1", kind: "item", categoryId: null, name: "فطير", description: null, imageUrl: null, isBest: false, isActive: true, variants };
}

const SMALL: MenuItemVariant = { id: "v1", label: "صغير", price: 50, talabatPrice: 60 };
const LARGE_CACHED_BEFORE_TALABAT = { id: "v2", label: "كبير", price: 80 } as MenuItemVariant;

describe("sellableVariants", () => {
  it("sells every variant at its normal price on the regular menu", () => {
    expect(sellableVariants(item([SMALL, LARGE_CACHED_BEFORE_TALABAT]), "regular").map((v) => v.salePrice)).toEqual([50, 80]);
  });

  it("skips variants from a catalog cached before the Talabat price existed", () => {
    const variants = sellableVariants(item([SMALL, LARGE_CACHED_BEFORE_TALABAT]), "talabat");
    expect(variants.map((v) => [v.id, v.salePrice])).toEqual([["v1", 60]]);
  });
});

describe("needsOptionPicker", () => {
  it("skips the picker when only one variant is sellable on the Talabat menu", () => {
    expect(needsOptionPicker(item([SMALL, LARGE_CACHED_BEFORE_TALABAT]), "regular")).toBe(true);
    expect(needsOptionPicker(item([SMALL, LARGE_CACHED_BEFORE_TALABAT]), "talabat")).toBe(false);
  });
});

describe("itemPriceLabel", () => {
  it("shows the price of the chosen menu", () => {
    expect(itemPriceLabel(item([SMALL]), "regular")).toContain("50");
    expect(itemPriceLabel(item([SMALL]), "talabat")).toContain("60");
  });

  it("says when a cached item has no Talabat price yet", () => {
    expect(itemPriceLabel(item([LARGE_CACHED_BEFORE_TALABAT]), "talabat")).toBe("مالوش سعر طلبات");
  });
});

describe("sellableAddons", () => {
  const cheese: MenuItem = {
    id: "a1", kind: "addon", categoryId: null, name: "جبنة", description: null, imageUrl: null, isBest: false, isActive: true,
    variants: [{ id: "av1", label: "عادي", price: 15, talabatPrice: 20 }],
  };

  it("prices each active addon by the chosen menu", () => {
    expect(sellableAddons([cheese], "regular")).toEqual([{ menuItemId: "a1", variantId: "av1", name: "جبنة", salePrice: 15 }]);
    expect(sellableAddons([cheese], "talabat")[0].salePrice).toBe(20);
  });

  it("skips inactive addons", () => {
    expect(sellableAddons([{ ...cheese, isActive: false }], "regular")).toEqual([]);
  });
});

describe("cartLineTotal", () => {
  it("adds the addons of one unit to the unit price, then multiplies by the quantity", () => {
    const line: CartLine = {
      key: "l1", variantId: "v1", comboId: null, itemName: "فطير", variantLabel: "صغير", unitPrice: 50, quantity: 2,
      addons: [{ variantId: "av1", name: "جبنة", quantity: 2, unitPrice: 15 }, { variantId: "av2", name: "عسل", quantity: 1, unitPrice: 10 }],
    };
    expect(cartLineTotal(line)).toBe((50 + 30 + 10) * 2);
  });
});
