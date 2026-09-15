import { CustomerFollowup } from "../../../src/contexts/crm/domain/customer-followup.aggregate";
import { UnknownCallResultError, UnknownSatisfactionRatingError } from "../../../src/contexts/crm/domain/errors";

describe("CustomerFollowup aggregate", () => {
  describe("register", () => {
    it("بيسجّل متابعة صحيحة بقيم افتراضية سليمة", () => {
      const followup = CustomerFollowup.register({
        legacyOrderId: 42,
        customerPhone: "01000000000",
        callResult: "answered",
        satisfactionRating: "good",
      });
      expect(followup.id).toBeTruthy();
      expect(followup.legacyOrderId).toBe(42);
      expect(followup.callResult).toBe("answered");
      expect(followup.satisfactionRating).toBe("good");
      expect(followup.hasComplaint).toBe(false);
      expect(followup.branchId).toBeNull();
    });

    it("بيرفض نتيجة اتصال مش معروفة", () => {
      expect(() =>
        CustomerFollowup.register({ customerPhone: "01000000000", callResult: "ghost" })
      ).toThrow(UnknownCallResultError);
    });

    it("بيرفض تقييم رضا مش معروف", () => {
      expect(() =>
        CustomerFollowup.register({
          customerPhone: "01000000000",
          callResult: "answered",
          satisfactionRating: "amazing",
        })
      ).toThrow(UnknownSatisfactionRatingError);
    });
  });

  describe("recordCall", () => {
    it("بيحدّث نتيجة المكالمة ووقتها لمحاولة تانية على نفس المتابعة", () => {
      const followup = CustomerFollowup.register({ customerPhone: "01000000000", callResult: "no_answer" });
      const firstCalledAt = followup.calledAt;
      followup.recordCall({ callResult: "answered", satisfactionRating: "excellent", hasComplaint: true });
      expect(followup.callResult).toBe("answered");
      expect(followup.satisfactionRating).toBe("excellent");
      expect(followup.hasComplaint).toBe(true);
      expect(followup.calledAt.getTime()).toBeGreaterThanOrEqual(firstCalledAt.getTime());
    });

    it("بيرفض نتيجة اتصال مش معروفة ومايغيّرش الحالة الحالية", () => {
      const followup = CustomerFollowup.register({ customerPhone: "01000000000", callResult: "answered" });
      expect(() => followup.recordCall({ callResult: "ghost" })).toThrow(UnknownCallResultError);
      expect(followup.callResult).toBe("answered");
    });
  });
});
