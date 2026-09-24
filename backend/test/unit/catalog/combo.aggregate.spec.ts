import { Combo } from "../../../src/contexts/catalog/domain/combo.aggregate";
import { ComboMissingItemsError, ComboNameRequiredError, InvalidComboItemError } from "../../../src/contexts/catalog/domain/errors";

function register(overrides: Partial<Parameters<typeof Combo.register>[0]> = {}) {
  return Combo.register({
    name: "عرض الغدا",
    price: 100,
    items: [{ variantId: "variant-1", quantity: 1 }],
    ...overrides,
  });
}

describe("Combo aggregate", () => {
  it("بيسجّل عرض صحيح نشط بشكل افتراضي", () => {
    const combo = register();
    expect(combo.name).toBe("عرض الغدا");
    expect(combo.price).toBe(100);
    expect(combo.isActive).toBe(true);
    expect(combo.items).toHaveLength(1);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => register({ name: "  " })).toThrow(ComboNameRequiredError);
  });

  it("بيرفض عرض من غير أي بند", () => {
    expect(() => register({ items: [] })).toThrow(ComboMissingItemsError);
  });

  it("بيرفض بند بكمية صفر أو سالبة", () => {
    expect(() => register({ items: [{ variantId: "variant-1", quantity: 0 }] })).toThrow(InvalidComboItemError);
    expect(() => register({ items: [{ variantId: "variant-1", quantity: -1 }] })).toThrow(InvalidComboItemError);
  });

  it("بند من غير quantity بياخد 1 افتراضيًا", () => {
    const combo = register({ items: [{ variantId: "variant-1" }] });
    expect(combo.items[0].quantity).toBe(1);
  });

  it("updateDetails بيحدّث الحقول المبعوتة بس", () => {
    const combo = register();
    combo.updateDetails({ price: 150 });
    expect(combo.price).toBe(150);
    expect(combo.name).toBe("عرض الغدا");
  });

  it("updateDetails برفض اسم فاضي من غير ما يغيّر الاسم الحالي", () => {
    const combo = register();
    expect(() => combo.updateDetails({ name: "  " })).toThrow(ComboNameRequiredError);
    expect(combo.name).toBe("عرض الغدا");
  });

  it("updateDetails بيقدر يعطّل العرض", () => {
    const combo = register();
    combo.updateDetails({ isActive: false });
    expect(combo.isActive).toBe(false);
  });

  it("replaceItems بيستبدل كل البنود بالكامل، وبيرفض لستة فاضية", () => {
    const combo = register();
    combo.replaceItems([
      { variantId: "variant-2", quantity: 2 },
      { variantId: "variant-3", quantity: 3 },
    ]);
    expect(combo.items).toHaveLength(2);
    expect(combo.items.map((i) => i.variantId)).toEqual(["variant-2", "variant-3"]);
    expect(() => combo.replaceItems([])).toThrow(ComboMissingItemsError);
  });
});
