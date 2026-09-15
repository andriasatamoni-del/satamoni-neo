import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import {
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
    const variant = item.addVariant({ label: "وسط", price: 90 });
    expect(item.variants).toHaveLength(1);
    expect(variant.price).toBe(90);
  });

  it("addVariant بيرفض حجم بنفس الاسم مرتين", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    item.addVariant({ label: "وسط", price: 90 });
    expect(() => item.addVariant({ label: "وسط", price: 100 })).toThrow(DuplicateVariantLabelError);
  });

  it("updateVariantPrice بيحدّث سعر حجم موجود ويرفض حجم مش موجود", () => {
    const item = MenuItem.register({ name: "بيتزا" });
    const variant = item.addVariant({ label: "كبير", price: 120 });
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
});
