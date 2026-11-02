import { describe, expect, it } from "vitest";
import { itemPriceLabel, needsOptionPicker, sellableVariants } from "./menuPricing";
import type { MenuItem, MenuItemVariant } from "./posTypes";

function item(variants: MenuItemVariant[]): MenuItem {
  return { id: "i1", categoryId: null, name: "فطير", description: null, imageUrl: null, isBest: false, isActive: true, variants, modifiers: [] };
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
