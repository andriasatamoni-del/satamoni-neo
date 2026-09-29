import { normalizeOnlineOrder, type OnlineOrderInput } from "../../../src/contexts/storefront/domain/online-order";
import { InvalidOnlineOrderError } from "../../../src/contexts/storefront/domain/errors";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const COMBO = "22222222-2222-4222-8222-222222222222";

function input(overrides: Partial<OnlineOrderInput> = {}): OnlineOrderInput {
  return {
    branch: { id: "b1", supportsDineIn: false },
    orderType: "delivery",
    customerName: " أحمد ",
    customerPhone: "010 1234-5678",
    addressDetails: "شارع 9 المعادي",
    items: [{ variantId: VARIANT, quantity: 2 }],
    ...overrides,
  };
}

describe("normalizeOnlineOrder - قواعد طلب الموقع", () => {
  test("دليفري: بينضّف الاسم والرقم، وبيضيف العلامة المميزة والتليفون التاني للعنوان", () => {
    const result = normalizeOnlineOrder(input({ distinguishingMark: "جنب الصيدلية", customerPhone2: "01100000000", notes: "  من غير بصل " }));
    expect(result).toMatchObject({
      branchId: "b1",
      orderType: "delivery",
      customerName: "أحمد",
      customerPhone: "01012345678",
      addressDetails: "شارع 9 المعادي - علامة مميزة: جنب الصيدلية - تليفون تاني: 01100000000",
      tableNumber: null,
      customerNotes: "من غير بصل",
    });
    expect(result.items).toEqual([{ variantId: VARIANT, comboId: undefined, quantity: 2, modifierIds: [] }]);
  });

  test("دليفري من غير عنوان مرفوض", () => {
    expect(() => normalizeOnlineOrder(input({ addressDetails: "  " }))).toThrow("اكتب العنوان بالتفصيل");
  });

  test("استلام من الفرع: مفيش عنوان حتى لو اتبعت", () => {
    expect(normalizeOnlineOrder(input({ orderType: "takeaway" })).addressDetails).toBeNull();
  });

  test("صالة: لازم الفرع يكون فيه صالة ورقم ترابيزة", () => {
    expect(() => normalizeOnlineOrder(input({ orderType: "dinein", tableNumber: "4" }))).toThrow("الفرع ده مفيهوش صالة");
    const branch = { id: "b1", supportsDineIn: true };
    expect(() => normalizeOnlineOrder(input({ orderType: "dinein", branch }))).toThrow("اكتب رقم الترابيزة");
    expect(normalizeOnlineOrder(input({ orderType: "dinein", branch, tableNumber: " 4 " })).tableNumber).toBe("4");
  });

  test.each([
    ["اسم فاضي", { customerName: "" }, "اكتب اسمك"],
    ["رقم قصير", { customerPhone: "0101" }, "رقم التليفون غير صالح"],
    ["رقم تاني غلط", { customerPhone2: "abc" }, "رقم التليفون التاني غير صالح"],
    ["سلة فاضية", { items: [] }, "السلة فاضية"],
    ["نوع غريب", { orderType: "drone" }, "نوع الطلب"],
    ["صنف وعرض في نفس السطر", { items: [{ variantId: VARIANT, comboId: COMBO, quantity: 1 }] }, "صنف غير صالح"],
    ["سطر من غير صنف", { items: [{ quantity: 1 }] }, "صنف غير صالح"],
    ["كمية صفر", { items: [{ variantId: VARIANT, quantity: 0 }] }, "الكمية غير صالحة"],
    ["كمية كسر", { items: [{ variantId: VARIANT, quantity: 1.5 }] }, "الكمية غير صالحة"],
    ["إضافات على عرض", { items: [{ comboId: COMBO, quantity: 1, modifierIds: [VARIANT] }] }, "العروض مالهاش إضافات"],
  ])("مرفوض: %s", (_label, overrides, message) => {
    expect(() => normalizeOnlineOrder(input(overrides as Partial<OnlineOrderInput>))).toThrow(InvalidOnlineOrderError);
    expect(() => normalizeOnlineOrder(input(overrides as Partial<OnlineOrderInput>))).toThrow(message as string);
  });
});
