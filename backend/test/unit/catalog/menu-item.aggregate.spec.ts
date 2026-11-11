import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import {
  AddonPlacementNotAllowedError,
  AddonSingleVariantError,
  DuplicateVariantLabelError,
  MenuItemNameRequiredError,
  VariantNotFoundError,
} from "../../../src/contexts/catalog/domain/errors";

describe("MenuItem aggregate", () => {
  it("بيسجّل صنف صحيح", () => {
    const item = MenuItem.register({ name: "  بيتزا مارجريتا  " });
    expect(item.name).toBe("بيتزا مارجريتا");
    expect(item.isActive).toBe(true);
    expect(item.variants).toEqual([]);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => MenuItem.register({ name: "  " })).toThrow(MenuItemNameRequiredError);
  });

  it("addVariant بيضيف حجم جديد", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    const variant = item.addVariant({ label: "وسط", price: 90, talabatPrice: 90 });
    expect(item.variants).toHaveLength(1);
    expect(variant.price).toBe(90);
  });

  it("addVariant بيرفض حجم بنفس الاسم مرتين", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    item.addVariant({ label: "وسط", price: 90, talabatPrice: 90 });
    expect(() => item.addVariant({ label: "وسط", price: 100, talabatPrice: 100 })).toThrow(DuplicateVariantLabelError);
  });

  it("updateVariantPrice بيحدّث سعر حجم موجود ويرفض حجم مش موجود", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    const variant = item.addVariant({ label: "كبير", price: 120, talabatPrice: 120 });
    item.updateVariantPrice(variant.id, 130);
    expect(item.variants[0].price).toBe(130);
    expect(() => item.updateVariantPrice("ghost-id", 100)).toThrow(VariantNotFoundError);
  });

  it("rename بيرفض اسم فاضي ومايغيّرش الاسم الحالي", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    expect(() => item.rename("  ")).toThrow(MenuItemNameRequiredError);
    expect(item.name).toBe("بيتزا");
  });

  it("updateDetails بيحدّث الحقول المبعوتة بس", () => {
    const item = MenuItem.register({ name: "بيتزا", description: "الأصلي" });
    item.updateDetails({ isBest: true });
    expect(item.isBest).toBe(true);
    expect(item.description).toBe("الأصلي");
  });

  it("activate/deactivate بيغيّروا isActive", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    item.deactivate();
    expect(item.isActive).toBe(false);
    item.activate();
    expect(item.isActive).toBe(true);
  });

  describe("kind", () => {
    it("الصنف العادي هو الافتراضي", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      expect(item.kind).toBe("item");
      expect(item.isItem).toBe(true);
    });

    it("الإضافة بتتسجّل بسعر واحد ومن غير قسم", () => {
      const addon = MenuItem.register({ kind: "addon", name: "جبنة إضافية" });
      addon.addVariant({ label: "عادي", price: 20, talabatPrice: 28 });
      expect(addon.isAddon).toBe(true);
      expect(addon.categoryId).toBeNull();
      expect(() => addon.addVariant({ label: "كبير", price: 30, talabatPrice: 40 })).toThrow(AddonSingleVariantError);
    });

    it("الإضافة مالهاش قسم ولا محطة", () => {
      expect(() => MenuItem.register({ kind: "addon", name: "جبنة", categoryId: "cat-1" })).toThrow(AddonPlacementNotAllowedError);
      const addon = MenuItem.register({ kind: "addon", name: "جبنة" });
      expect(() => addon.updateDetails({ categoryId: "cat-1" })).toThrow(AddonPlacementNotAllowedError);
      expect(() => addon.setStationId("station-1")).toThrow(AddonPlacementNotAllowedError);
      addon.updateDetails({ categoryId: null, description: "موتزاريلا" });
      expect(addon.description).toBe("موتزاريلا");
    });

    it("الإضافة مبتبقاش الأكثر مبيعًا", () => {
      const addon = MenuItem.register({ kind: "addon", name: "جبنة", isBest: true });
      expect(addon.isBest).toBe(false);
      addon.updateDetails({ isBest: true });
      expect(addon.isBest).toBe(false);
    });
  });
});
