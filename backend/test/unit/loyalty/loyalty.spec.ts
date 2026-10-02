import { LoyaltyReward } from "../../../src/contexts/loyalty/domain/loyalty-reward.aggregate";
import { pointsEarnedFor } from "../../../src/contexts/loyalty/domain/loyalty-rules";
import { InvalidLoyaltyRewardError } from "../../../src/contexts/loyalty/domain/errors";

describe("Loyalty - قواعد النقاط والمكافآت", () => {
  test.each([
    [100, 0.1, 10],
    [380, 0.1, 38],
    [99.99, 0.1, 9],
    [250, 0.05, 12],
    [0, 0.1, 0],
    [500, 0, 0],
  ])("pointsEarnedFor(%p, %p) = %p (floor، ومن غير أخطاء الكسور العشرية)", (total, rate, expected) => {
    expect(pointsEarnedFor(total, rate)).toBe(expected);
  });

  test("كل نوع مكافأة بهدفه بس، وأي هدف تاني بيتشال", () => {
    const discount = LoyaltyReward.register({ name: " خصم ", pointsCost: 50, kind: "discount", discountAmount: 20.456, variantId: "v1" });
    expect(discount).toMatchObject({ name: "خصم", discountAmount: 20.46, variantId: null, comboId: null, isActive: true });
    const gift = LoyaltyReward.register({ name: "بيتزا هدية", pointsCost: 30, kind: "free_item", variantId: "v1", discountAmount: 5 });
    expect(gift).toMatchObject({ variantId: "v1", discountAmount: null });
  });

  test.each([
    [{ name: "", pointsCost: 10, kind: "discount", discountAmount: 5 }, "لازم اسم للمكافأة"],
    [{ name: "x", pointsCost: 0, kind: "discount", discountAmount: 5 }, "عدد النقاط"],
    [{ name: "x", pointsCost: 1.5, kind: "discount", discountAmount: 5 }, "عدد النقاط"],
    [{ name: "x", pointsCost: 10, kind: "cashback" }, "نوع المكافأة"],
    [{ name: "x", pointsCost: 10, kind: "discount" }, "لازم مبلغ الخصم"],
    [{ name: "x", pointsCost: 10, kind: "free_item" }, "اختار الصنف"],
    [{ name: "x", pointsCost: 10, kind: "free_combo" }, "اختار العرض"],
  ])("مرفوض: %j", (input, message) => {
    expect(() => LoyaltyReward.register(input)).toThrow(InvalidLoyaltyRewardError);
    expect(() => LoyaltyReward.register(input)).toThrow(message);
  });
});
