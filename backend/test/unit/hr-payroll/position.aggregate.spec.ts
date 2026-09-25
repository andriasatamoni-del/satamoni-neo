import { Position } from "../../../src/contexts/hr-payroll/domain/position.aggregate";
import { PositionCodeRequiredError, PositionNameRequiredError } from "../../../src/contexts/hr-payroll/domain/errors";

describe("Position aggregate", () => {
  it("بيسجّل مسمى وظيفي صحيح نشط بشكل افتراضي، departmentId اختياري", () => {
    const position = Position.register({ code: "CHEF", name: "شيف" });
    expect(position.code).toBe("CHEF");
    expect(position.status).toBe("active");
    expect(position.departmentId).toBeNull();
  });

  it("بيرفض كود فاضي", () => {
    expect(() => Position.register({ code: "  ", name: "شيف" })).toThrow(PositionCodeRequiredError);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Position.register({ code: "CHEF", name: "  " })).toThrow(PositionNameRequiredError);
  });

  it("register بـdepartmentId بيسجّله", () => {
    const position = Position.register({ code: "CHEF", name: "شيف", departmentId: "dept-1" });
    expect(position.departmentId).toBe("dept-1");
  });

  it("update بيحدّث departmentId/status، وبيرفض اسم فاضي من غير ما يغيّر الاسم الحالي", () => {
    const position = Position.register({ code: "CHEF", name: "شيف" });
    position.update({ departmentId: "dept-1", status: "inactive" });
    expect(position.departmentId).toBe("dept-1");
    expect(position.status).toBe("inactive");

    expect(() => position.update({ name: "  " })).toThrow(PositionNameRequiredError);
    expect(position.name).toBe("شيف");
  });
});
