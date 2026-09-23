import { PayrollAdjustment } from "../../../src/contexts/hr-payroll/domain/payroll-adjustment.aggregate";
import {
  AdjustmentAmountMustBePositiveError,
  CancellationReasonRequiredError,
  PayrollAdjustmentAlreadyCancelledError,
  UnknownAdjustmentTypeError,
} from "../../../src/contexts/hr-payroll/domain/errors";

describe("PayrollAdjustment aggregate", () => {
  it("register بيسجّل سلفة/جزاء/مكافأة نشطة", () => {
    const adjustment = PayrollAdjustment.register({
      employeeId: "emp-1", entryDate: new Date("2026-01-01"), adjustmentType: "penalty", amount: 100,
    });
    expect(adjustment.status).toBe("ACTIVE");
    expect(adjustment.amount).toBe(100);
    expect(adjustment.adjustmentType).toBe("penalty");
  });

  it("register بيرفض نوع مش معروف", () => {
    expect(() =>
      PayrollAdjustment.register({ employeeId: "emp-1", entryDate: new Date(), adjustmentType: "ghost", amount: 100 })
    ).toThrow(UnknownAdjustmentTypeError);
  });

  it("register بيرفض مبلغ صفر أو سالب", () => {
    expect(() =>
      PayrollAdjustment.register({ employeeId: "emp-1", entryDate: new Date(), adjustmentType: "bonus", amount: 0 })
    ).toThrow(AdjustmentAmountMustBePositiveError);
    expect(() =>
      PayrollAdjustment.register({ employeeId: "emp-1", entryDate: new Date(), adjustmentType: "bonus", amount: -50 })
    ).toThrow(AdjustmentAmountMustBePositiveError);
  });

  it("cancel بيحتاج سبب وبيسجّل مين ألغى وإمتى", () => {
    const adjustment = PayrollAdjustment.register({ employeeId: "emp-1", entryDate: new Date(), adjustmentType: "advance", amount: 200 });
    expect(() => adjustment.cancel({ reason: "" })).toThrow(CancellationReasonRequiredError);

    adjustment.cancel({ reason: "غلط في التسجيل", cancelledBy: "user-2" });
    expect(adjustment.status).toBe("CANCELLED");
    expect(adjustment.cancelledBy).toBe("user-2");
    expect(adjustment.cancellationReason).toBe("غلط في التسجيل");
    expect(adjustment.cancelledAt).not.toBeNull();
  });

  it("cancel بيرفض إلغاء سجل ملغى بالفعل", () => {
    const adjustment = PayrollAdjustment.register({ employeeId: "emp-1", entryDate: new Date(), adjustmentType: "advance", amount: 200 });
    adjustment.cancel({ reason: "سبب" });
    expect(() => adjustment.cancel({ reason: "سبب تاني" })).toThrow(PayrollAdjustmentAlreadyCancelledError);
  });
});
