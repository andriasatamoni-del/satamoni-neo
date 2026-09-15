import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { BranchNameRequiredError } from "../../../src/contexts/branches/domain/errors";

describe("Branch aggregate", () => {
  it("بيسجّل فرع صحيح", () => {
    const branch = Branch.register({ name: "  محرم بك  ", supportsDineIn: false });
    expect(branch.name).toBe("محرم بك");
    expect(branch.supportsDineIn).toBe(false);
    expect(branch.isCentralKitchen).toBe(false);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Branch.register({ name: "   " })).toThrow(BranchNameRequiredError);
  });

  it("rename بيرفض اسم فاضي ومايغيّرش الاسم الحالي", () => {
    const branch = Branch.register({ name: "الإبراهيمية" });
    expect(() => branch.rename("  ")).toThrow(BranchNameRequiredError);
    expect(branch.name).toBe("الإبراهيمية");
  });

  it("updateDetails بيحدّث الحقول المبعوتة بس", () => {
    const branch = Branch.register({ name: "العصافرة", phone: "123" });
    branch.updateDetails({ address: "شارع 1" });
    expect(branch.address).toBe("شارع 1");
    expect(branch.phone).toBe("123");
  });
});
