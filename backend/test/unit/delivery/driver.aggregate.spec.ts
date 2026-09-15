import { Driver } from "../../../src/contexts/delivery/domain/driver.aggregate";
import { DriverNameRequiredError, UnknownDriverStatusError } from "../../../src/contexts/delivery/domain/errors";

describe("Driver aggregate", () => {
  it("بيسجّل سائق صحيح بحالة AVAILABLE افتراضية", () => {
    const driver = Driver.register({ name: "أحمد", branchId: "branch-1" });
    expect(driver.status).toBe("AVAILABLE");
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Driver.register({ name: "  ", branchId: "branch-1" })).toThrow(DriverNameRequiredError);
  });

  it("changeStatus بيرفض حالة مش معروفة ومايغيّرش الحالة الحالية", () => {
    const driver = Driver.register({ name: "أحمد", branchId: "branch-1" });
    expect(() => driver.changeStatus("ghost")).toThrow(UnknownDriverStatusError);
    expect(driver.status).toBe("AVAILABLE");
  });

  it("changeStatus بيغيّر الحالة لو صحيحة", () => {
    const driver = Driver.register({ name: "أحمد", branchId: "branch-1" });
    driver.changeStatus("BUSY");
    expect(driver.status).toBe("BUSY");
  });
});
