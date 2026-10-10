import { MenuCategory } from "../../../src/contexts/catalog/domain/menu-category.aggregate";
import { MenuCategoryArchivedError, MenuCategoryNameRequiredError, MenuCategoryNotArchivedError } from "../../../src/contexts/catalog/domain/errors";

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

describe("MenuCategory archive / restore", () => {
  it("الأرشفة بتوقف القسم وبتسجّل وقتها", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    const when = new Date("2026-10-08T10:00:00Z");
    category.archive(when);
    expect(category.isArchived).toBe(true);
    expect(category.archivedAt).toEqual(when);
    expect(category.isActive).toBe(false);
  });

  it("قسم مؤرشف مينفعش يتفعّل ولا يتأرشف تاني", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    category.archive();
    expect(() => category.activate()).toThrow(MenuCategoryArchivedError);
    expect(() => category.archive()).toThrow(MenuCategoryArchivedError);
  });

  it("الاسترجاع بيرجّع القسم موقوف، وتفعيله بعد كده قرار صريح", () => {
    const category = MenuCategory.register({ name: "مقبلات" });
    category.archive();
    category.restore();
    expect(category.isArchived).toBe(false);
    expect(category.isActive).toBe(false);
    category.activate();
    expect(category.isActive).toBe(true);
  });

  it("استرجاع قسم مش مؤرشف = تعارض", () => {
    expect(() => MenuCategory.register({ name: "مقبلات" }).restore()).toThrow(MenuCategoryNotArchivedError);
  });

  it("الأخطاء دي تعارض حالة (409) مش خطأ إدخال", () => {
    expect(new MenuCategoryArchivedError().httpStatus).toBe(409);
    expect(new MenuCategoryNotArchivedError().httpStatus).toBe(409);
  });
});
