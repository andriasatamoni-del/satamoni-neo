import { Department } from "../../../src/contexts/hr-payroll/domain/department.aggregate";
import { DepartmentCodeRequiredError, DepartmentNameRequiredError } from "../../../src/contexts/hr-payroll/domain/errors";

describe("Department aggregate", () => {
  it("بيسجّل قسم صحيح نشط بشكل افتراضي", () => {
    const department = Department.register({ code: "KITCHEN", name: "  المطبخ  " });
    expect(department.code).toBe("KITCHEN");
    expect(department.name).toBe("المطبخ");
    expect(department.status).toBe("active");
  });

  it("بيرفض كود فاضي", () => {
    expect(() => Department.register({ code: "  ", name: "المطبخ" })).toThrow(DepartmentCodeRequiredError);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Department.register({ code: "KITCHEN", name: "  " })).toThrow(DepartmentNameRequiredError);
  });

  it("update بيحدّث الحقول المبعوتة بس، وبيرفض اسم فاضي من غير ما يغيّر الاسم الحالي", () => {
    const department = Department.register({ code: "KITCHEN", name: "المطبخ" });
    department.update({ description: "قسم المطبخ" });
    expect(department.name).toBe("المطبخ");
    expect(department.description).toBe("قسم المطبخ");

    expect(() => department.update({ name: "  " })).toThrow(DepartmentNameRequiredError);
    expect(department.name).toBe("المطبخ");
  });

  it("update بيقدر يعطّل القسم (status=inactive)", () => {
    const department = Department.register({ code: "KITCHEN", name: "المطبخ" });
    department.update({ status: "inactive" });
    expect(department.status).toBe("inactive");
  });
});
