import { Employee } from "../../../src/contexts/hr-payroll/domain/employee.aggregate";
import { EmployeeNameRequiredError, UnknownWageTypeError, UnknownEmployeeStatusError } from "../../../src/contexts/hr-payroll/domain/errors";

describe("Employee aggregate", () => {
  it("بيسجّل موظف صحيح - status active افتراضيًا", () => {
    const employee = Employee.register({ name: "أحمد", baseSalary: 4000 });
    expect(employee.status).toBe("active");
    expect(employee.wageType).toBe("fixed_monthly");
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Employee.register({ name: "  " })).toThrow(EmployeeNameRequiredError);
  });

  it("بيرفض نوع أجر مش معروف", () => {
    expect(() => Employee.register({ name: "أحمد", wageType: "ghost" })).toThrow(UnknownWageTypeError);
  });

  it("userId اختياري - مفيش حساب دخول مرتبط", () => {
    const employee = Employee.register({ name: "أحمد" });
    expect(employee.userId).toBeNull();
  });

  it("terminate بيحدّث الحالة وتاريخ/سبب الإنهاء", () => {
    const employee = Employee.register({ name: "أحمد" });
    const date = new Date("2026-01-01");
    employee.terminate({ date, reason: "استقالة" });
    expect(employee.status).toBe("terminated");
    expect(employee.terminationDate).toBe(date);
    expect(employee.terminationReason).toBe("استقالة");
  });

  it("setStatus لحالة مش terminated بيمسح تاريخ/سبب الإنهاء", () => {
    const employee = Employee.register({ name: "أحمد" });
    employee.terminate({ date: new Date(), reason: "استقالة" });
    employee.setStatus("active");
    expect(employee.status).toBe("active");
    expect(employee.terminationDate).toBeNull();
    expect(employee.terminationReason).toBeNull();
  });

  it("بيرفض حالة مش معروفة", () => {
    const employee = Employee.register({ name: "أحمد" });
    expect(() => employee.setStatus("ghost")).toThrow(UnknownEmployeeStatusError);
  });

  it("updateDetails بيحدّث فعليًا (idempotency لسكريبت الاستيراد)", () => {
    const employee = Employee.register({ name: "أحمد", baseSalary: 4000 });
    employee.updateDetails({ name: "أحمد معدّل", baseSalary: 5000, department: "المبيعات" });
    expect(employee.name).toBe("أحمد معدّل");
    expect(employee.baseSalary).toBe(5000);
    expect(employee.department).toBe("المبيعات");
  });
});
