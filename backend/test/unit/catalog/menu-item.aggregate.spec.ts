import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import {
  DuplicateModifierNameError,
  DuplicateVariantLabelError,
  MenuItemNameRequiredError,
  ModifierNotFoundError,
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

  describe("modifiers", () => {
    it("addModifier بيضيف مرفق جديد نشط افتراضيًا", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      const modifier = item.addModifier({ name: "إضافة جبنة", priceDelta: 15 });
      expect(item.modifiers).toHaveLength(1);
      expect(modifier.isActive).toBe(true);
      expect(modifier.priceDelta).toBe(15);
    });

    it("addModifier بيرفض مرفق بنفس الاسم مرتين في نفس الصنف", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      item.addModifier({ name: "إضافة جبنة", priceDelta: 15 });
      expect(() => item.addModifier({ name: "إضافة جبنة", priceDelta: 20 })).toThrow(DuplicateModifierNameError);
    });

    it("updateModifier بيحدّث الحقول المبعوتة بس ويرفض مرفق مش موجود", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      const modifier = item.addModifier({ name: "إضافة جبنة", priceDelta: 15 });
      item.updateModifier(modifier.id, { priceDelta: 20 });
      expect(item.modifiers[0].priceDelta).toBe(20);
      expect(item.modifiers[0].name).toBe("إضافة جبنة");
      expect(() => item.updateModifier("ghost-id", { priceDelta: 1 })).toThrow(ModifierNotFoundError);
    });

    it("updateModifier بيرفض تعارض الاسم مع مرفق تاني في نفس الصنف", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      item.addModifier({ name: "إضافة جبنة", priceDelta: 15 });
      const second = item.addModifier({ name: "بدون طماطم", priceDelta: 0 });
      expect(() => item.updateModifier(second.id, { name: "إضافة جبنة" })).toThrow(DuplicateModifierNameError);
    });

    it("setModifierVariantPrice/resolveModifierPrice - سعر مخصوص لحجم بيغلب الافتراضي، وإلا الافتراضي", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      const small = item.addVariant({ label: "صغير", price: 60 });
      const large = item.addVariant({ label: "كبير", price: 120 });
      const modifier = item.addModifier({ name: "إضافة سجق", priceDelta: 10 });

      expect(item.resolveModifierPrice(modifier.id, small.id)).toBe(10);
      expect(item.resolveModifierPrice(modifier.id, large.id)).toBe(10);

      item.setModifierVariantPrice(modifier.id, large.id, 18);
      expect(item.resolveModifierPrice(modifier.id, large.id)).toBe(18);
      expect(item.resolveModifierPrice(modifier.id, small.id)).toBe(10);
    });

    it("clearModifierVariantPrice بيرجّع السعر للافتراضي", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      const large = item.addVariant({ label: "كبير", price: 120 });
      const modifier = item.addModifier({ name: "إضافة سجق", priceDelta: 10 });
      item.setModifierVariantPrice(modifier.id, large.id, 18);
      item.clearModifierVariantPrice(modifier.id, large.id);
      expect(item.resolveModifierPrice(modifier.id, large.id)).toBe(10);
    });

    it("resolveModifierPrice بيرفض مرفق مش موجود", () => {
      const item = MenuItem.register({ name: "بيتزا" });
      expect(() => item.resolveModifierPrice("ghost-id", "ghost-variant")).toThrow(ModifierNotFoundError);
    });
  });
});
