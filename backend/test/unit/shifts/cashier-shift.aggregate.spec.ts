import { CashierShift, VARIANCE_ACK_THRESHOLD_EGP } from "../../../src/contexts/shifts/domain/cashier-shift.aggregate";
import { ShiftNotActiveError, ShiftNotPendingReviewError } from "../../../src/contexts/shifts/domain/errors";

function financials(cashSales: number) {
  return { cashSales, cardSales: 0, otherSales: 0, orderCount: 0 };
}

describe("CashierShift aggregate", () => {
  it("register بيبدأ الشيفت ACTIVE برصيد الافتتاح", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    expect(shift.status).toBe("ACTIVE");
    expect(shift.openingCash).toBe(300);
  });

  it("close بفرق كبير (فوق الحد) بيحوّل الشيفت PENDING_REVIEW مش CLOSED", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 300, financials: financials(500), closedBy: "u1" });
    // متوقع = 300 + 500 = 800، فعلي = 300 -> عجز 500 جنيه، فوق الحد بكتير
    expect(shift.status).toBe("PENDING_REVIEW");
    expect(shift.cashVariance).toBe(-500);
  });

  it("close بفرق صفر بيقفل مباشرة CLOSED وvarianceStatus=NONE", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 800, financials: financials(500), closedBy: "u1" });
    expect(shift.status).toBe("CLOSED");
    expect(shift.varianceStatus).toBe("NONE");
    expect(shift.cashVariance).toBe(0);
  });

  it(`close بفرق جوّه ${VARIANCE_ACK_THRESHOLD_EGP} جنيه بيتقفل تلقائيًا برضه`, () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 300 + VARIANCE_ACK_THRESHOLD_EGP, financials: financials(0), closedBy: "u1" });
    expect(shift.status).toBe("CLOSED");
    expect(shift.varianceStatus).toBe("NONE");
  });

  it(`close بفرق فوق ${VARIANCE_ACK_THRESHOLD_EGP} جنيه بيحوّل الشيفت PENDING_REVIEW`, () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 300 + VARIANCE_ACK_THRESHOLD_EGP + 1, financials: financials(0), closedBy: "u1" });
    expect(shift.status).toBe("PENDING_REVIEW");
    expect(shift.varianceStatus).toBe("PENDING_REVIEW");
    expect(shift.cashVariance).toBe(VARIANCE_ACK_THRESHOLD_EGP + 1);
  });

  it("close على شيفت مقفول بالفعل بيرمي ShiftNotActiveError", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 300, financials: financials(0), closedBy: "u1" });
    expect(() => shift.close({ actualCash: 300, financials: financials(0), closedBy: "u1" })).toThrow(ShiftNotActiveError);
  });

  it("reviewVariance approve بيقفل الشيفت نهائيًا ويسجّل المراجع", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 100, financials: financials(0), closedBy: "u1" }); // عجز 200 -> PENDING_REVIEW
    expect(shift.status).toBe("PENDING_REVIEW");

    shift.reviewVariance({ decision: "approve", reviewerId: "manager-1", notes: "اتأكد فعليًا" });
    expect(shift.status).toBe("CLOSED");
    expect(shift.varianceStatus).toBe("APPROVED");
    expect(shift.varianceReviewedBy).toBe("manager-1");
  });

  it("reviewVariance acknowledge بيقفل الشيفت من غير ما يحمّل مسؤولية", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 100, financials: financials(0), closedBy: "u1" });
    shift.reviewVariance({ decision: "acknowledge", reviewerId: "manager-1" });
    expect(shift.varianceStatus).toBe("ACKNOWLEDGED");
  });

  it("reviewVariance على شيفت مش PENDING_REVIEW بيرمي ShiftNotPendingReviewError", () => {
    const shift = CashierShift.register({ branchId: "b1", userId: "u1", openingCash: 300 });
    shift.close({ actualCash: 300, financials: financials(0), closedBy: "u1" }); // فرق صفر -> CLOSED مباشرة
    expect(() => shift.reviewVariance({ decision: "approve", reviewerId: "manager-1" })).toThrow(ShiftNotPendingReviewError);
  });
});
