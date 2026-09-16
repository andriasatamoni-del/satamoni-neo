import { PayrollRun } from "../../../src/contexts/hr-payroll/domain/payroll-run.aggregate";
import { PayrollRunNotDraftError, PayrollRunNotApprovedError, UnknownMonthError } from "../../../src/contexts/hr-payroll/domain/errors";

describe("PayrollRun aggregate", () => {
  it("بيسجّل قائمة DRAFT، وبيحسب netPay/totalNetPay مش بيوثق مدخلات الطالب", () => {
    const run = PayrollRun.register({
      year: 2026,
      month: 9,
      employees: [
        { employeeId: "emp-1", employeeName: "أحمد", grossPay: 5000, advances: 200, penalties: 100, bonuses: 50 },
        { employeeId: "emp-2", employeeName: "محمد", grossPay: 4000 },
      ],
    });
    expect(run.status).toBe("DRAFT");
    expect(run.employees[0].netPay).toBe(5000 - 200 - 100 + 50);
    expect(run.employees[1].netPay).toBe(4000);
    expect(run.totalNetPay).toBe(run.employees[0].netPay + run.employees[1].netPay);
  });

  it("بيرفض شهر غير صحيح", () => {
    expect(() => PayrollRun.register({ year: 2026, month: 13, employees: [] })).toThrow(UnknownMonthError);
    expect(() => PayrollRun.register({ year: 2026, month: 0, employees: [] })).toThrow(UnknownMonthError);
  });

  it("approve بيحوّل الحالة لـAPPROVED", () => {
    const run = PayrollRun.register({ year: 2026, month: 9, employees: [] });
    run.approve("admin-1");
    expect(run.status).toBe("APPROVED");
    expect(run.approvedBy).toBe("admin-1");
    expect(run.approvedAt).not.toBeNull();
  });

  it("بيرفض اعتماد قائمة مش DRAFT", () => {
    const run = PayrollRun.register({ year: 2026, month: 9, employees: [] });
    run.approve("admin-1");
    expect(() => run.approve("admin-2")).toThrow(PayrollRunNotDraftError);
  });

  it("cancel بيحوّل الحالة لـCANCELLED بعد الاعتماد بس", () => {
    const run = PayrollRun.register({ year: 2026, month: 9, employees: [] });
    expect(() => run.cancel({ reason: "غلط" })).toThrow(PayrollRunNotApprovedError);

    run.approve("admin-1");
    run.cancel({ cancelledBy: "admin-2", reason: "غلط في الحساب" });
    expect(run.status).toBe("CANCELLED");
    expect(run.cancellationReason).toBe("غلط في الحساب");
  });

  it("assertDraft بيرفض لو الحالة اتغيّرت - بوابة الحذف الصريح لقائمة DRAFT بس", () => {
    const run = PayrollRun.register({ year: 2026, month: 9, employees: [] });
    expect(() => run.assertDraft()).not.toThrow();
    run.approve("admin-1");
    expect(() => run.assertDraft()).toThrow(PayrollRunNotDraftError);
  });
});
