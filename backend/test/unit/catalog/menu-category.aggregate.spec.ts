import { MenuCategory } from "../../../src/contexts/catalog/domain/menu-category.aggregate";
import { MenuCategoryNameRequiredError } from "../../../src/contexts/catalog/domain/errors";

describe("MenuCategory aggregate", () => {
  it("بيسجّل قسم صحيح نشط بشكل افتراضي", () => {
    const category = MenuCategory.register({ name: "  مقبلات  " });
    expect(category.name).toBe("مقبلات");
    expect(category.isActive).toBe(true);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => MenuCategory.register({ name: "  " })).toThrow(MenuCategoryNameRequiredError);
  });

  it("activate/deactivate بيغيّروا isActive", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    category.deactivate();
    expect(category.isActive).toBe(false);
    category.activate();
    expect(category.isActive).toBe(true);
  });

  it("updateDetails بيحدّث الحقول المبعوتة بس", () => {
    const category = MenuCategory.register({ name: "مقبلات", displayOrder: 1 });
    category.updateDetails({ displayOrder: 5 });
    expect(category.displayOrder).toBe(5);
    expect(category.name).toBe("مقبلات");
  });

  it("updateDetails برفض اسم فاضي من غير ما يغيّر الاسم الحالي", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    expect(() => category.updateDetails({ name: "  " })).toThrow(MenuCategoryNameRequiredError);
    expect(category.name).toBe("مقبلات");
  });

  it("updateDetails بيعدّل الاسم ومجموعة القائمة", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    category.updateDetails({ name: "مقبلات صيامي", menuGroup: "fasting" });
    expect(category.name).toBe("مقبلات صيامي");
    expect(category.menuGroup).toBe("fasting");
  });
});
