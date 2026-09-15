import { Supplier } from "../../../src/contexts/procurement/domain/supplier.aggregate";
import { SupplierNameRequiredError, UnknownSupplierStatusError } from "../../../src/contexts/procurement/domain/errors";

describe("Supplier aggregate", () => {
  it("بيسجّل مورد صحيح بحالة ACTIVE افتراضية", () => {
    const supplier = Supplier.register({ name: "مورد الدقيق" });
    expect(supplier.status).toBe("ACTIVE");
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => Supplier.register({ name: "  " })).toThrow(SupplierNameRequiredError);
  });

  it("changeStatus بيرفض حالة مش معروفة ومايغيّرش الحالة الحالية", () => {
    const supplier = Supplier.register({ name: "مورد" });
    expect(() => supplier.changeStatus("ghost")).toThrow(UnknownSupplierStatusError);
    expect(supplier.status).toBe("ACTIVE");
  });

  it("changeStatus بيغيّر الحالة لو صحيحة", () => {
    const supplier = Supplier.register({ name: "مورد" });
    supplier.changeStatus("BLOCKED");
    expect(supplier.status).toBe("BLOCKED");
  });

  it("updateDetails بيحدّث الحقول المبعوتة بس", () => {
    const supplier = Supplier.register({ name: "مورد", phone: "123" });
    supplier.updateDetails({ email: "s@example.com" });
    expect(supplier.email).toBe("s@example.com");
    expect(supplier.phone).toBe("123");
  });
});
