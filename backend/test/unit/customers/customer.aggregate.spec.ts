import { Customer } from "../../../src/contexts/customers/domain/customer.aggregate";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressFieldRequiredError,
  CustomerAddressNotFoundError,
  InvalidEmailError,
  SecondPhoneRequiredError,
  CustomerNameRequiredError,
  InvalidPhoneError,
  WeakCustomerPasswordError,
} from "../../../src/contexts/customers/domain/errors";

function register(overrides: Partial<Parameters<typeof Customer.register>[0]> = {}) {
  return Customer.register({
    phone: "01012345678", phone2: "01198765432", email: "Ahmed@Example.com", name: "أحمد", passwordHash: "hashed", ...overrides,
  });
}

const ADDRESS = { area: "المعادي", street: "شارع 9", building: "12", floor: "3", apartment: "5" };

describe("Customer aggregate", () => {
  it("بيسجّل عميل صحيح، وبينضّف رقم التليفون من مسافات/شرطات", () => {
    const customer = register({ phone: "010 1234-5678" });
    expect(customer.phone).toBe("01012345678");
    expect(customer.hasAccount).toBe(true);
    expect(customer.loyaltyPoints).toBe(0);
    expect(customer.isBlocked).toBe(false);
    expect(customer.email).toBe("ahmed@example.com");
    expect(customer.phone2).toBe("01198765432");
    expect(customer.missingProfileFields).toEqual(["address"]);
  });

  it("الإيميل والرقم التاني إلزاميين وصالحين، والرقم التاني مختلف عن الأساسي", () => {
    expect(() => register({ email: "not-an-email" })).toThrow(InvalidEmailError);
    expect(() => register({ email: "" })).toThrow(InvalidEmailError);
    expect(() => register({ phone2: "" })).toThrow(InvalidPhoneError);
    expect(() => register({ phone2: "010 1234 5678" })).toThrow(SecondPhoneRequiredError);
  });

  it("بيرفض رقم تليفون غير صالح", () => {
    expect(() => register({ phone: "abc" })).toThrow(InvalidPhoneError);
    expect(() => register({ phone: "123" })).toThrow(InvalidPhoneError);
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => register({ name: "  " })).toThrow(CustomerNameRequiredError);
  });

  it("validatePasswordPolicy بيرفض كلمة سر قصيرة", () => {
    expect(() => Customer.validatePasswordPolicy("12345")).toThrow(WeakCustomerPasswordError);
    expect(() => Customer.validatePasswordPolicy("123456")).not.toThrow();
  });

  it("activateAccount بيحوّل عميل ضيف (من غير حساب) لحساب حقيقي، وبيحافظ على نقاط الولاء", () => {
    const guest = Customer.reconstitute("guest-1", {
      phone: "01012345678", phone2: null, email: null, name: null, addressDetails: null, distinguishingMark: null,
      notes: null, loyaltyPoints: 50, passwordHash: null, isBlocked: false, blockReason: null,
      blockedBy: null, blockedAt: null, addresses: [], legacyCustomerId: null, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(guest.hasAccount).toBe(false);
    expect(guest.missingProfileFields).toEqual(["email", "phone2", "address"]);
    guest.activateAccount({ name: "محمد", passwordHash: "hashed-2", email: "m@x.io", phone2: "01200000000" });
    expect(guest.hasAccount).toBe(true);
    expect(guest.name).toBe("محمد");
    expect(guest.loyaltyPoints).toBe(50);
  });

  it("activateAccount برفض لو الحساب موجود بالفعل", () => {
    const customer = register();
    expect(() => customer.activateAccount({ name: "تاني", passwordHash: "x", email: "a@b.cc", phone2: "01200000000" })).toThrow(CustomerAccountAlreadyExistsError);
  });

  it("updateProfile بيحدّث الحقول المبعوتة بس", () => {
    const customer = register();
    customer.updateProfile({ addressDetails: "شارع 1" });
    expect(customer.addressDetails).toBe("شارع 1");
    expect(customer.name).toBe("أحمد");
  });

  it("addLoyaltyPoints بيجمع النقاط", () => {
    const customer = register();
    customer.addLoyaltyPoints(10);
    customer.addLoyaltyPoints(5);
    expect(customer.loyaltyPoints).toBe(15);
  });

  it("block/unblock بيغيّروا الحالة", () => {
    const customer = register();
    customer.block({ reason: "بلاغات كتير", blockedBy: "staff-1" });
    expect(customer.isBlocked).toBe(true);
    expect(customer.blockReason).toBe("بلاغات كتير");
    customer.unblock();
    expect(customer.isBlocked).toBe(false);
    expect(customer.blockReason).toBeNull();
  });

  it("updateContact: بيكمّل/يغيّر الإيميل والرقم التاني بنفس قواعد التسجيل", () => {
    const customer = register();
    customer.updateContact({ email: "NEW@mail.com", name: " أحمد علي " });
    expect(customer.email).toBe("new@mail.com");
    expect(customer.name).toBe("أحمد علي");
    expect(() => customer.updateContact({ phone2: customer.phone })).toThrow(SecondPhoneRequiredError);
  });

  it("addAddress: كل حقول العنوان المقسّم إلزامية، والنص الكامل بيتجمّع منها، وأول عنوان افتراضي", () => {
    const customer = register();
    expect(() => customer.addAddress({ ...ADDRESS, building: "  " })).toThrow(CustomerAddressFieldRequiredError);
    expect(() => customer.addAddress({ ...ADDRESS, building: "  " })).toThrow("لازم رقم العمارة في العنوان");

    const first = customer.addAddress({ ...ADDRESS, distinguishingMark: "جنب الصيدلية" });
    expect(first.isDefault).toBe(true);
    expect(first.addressDetails).toBe("المعادي - شارع 9 - عمارة 12 - الدور 3 - شقة 5");
    expect(customer.missingProfileFields).toEqual([]);

    const second = customer.addAddress({ ...ADDRESS, area: "مدينة نصر", isDefault: true });
    expect(customer.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id]);
  });

  it("removeAddress/setDefaultAddress: حذف الافتراضي بيخلّي اللي بعده افتراضي، وعنوان مش موجود مرفوض", () => {
    const customer = register();
    const a = customer.addAddress(ADDRESS);
    const b = customer.addAddress({ ...ADDRESS, area: "الزمالك" });
    customer.setDefaultAddress(b.id);
    expect(customer.findAddress(b.id)?.isDefault).toBe(true);
    expect(customer.findAddress(a.id)?.isDefault).toBe(false);
    customer.removeAddress(b.id);
    expect(customer.findAddress(a.id)?.isDefault).toBe(true);
    expect(() => customer.removeAddress("nope")).toThrow(CustomerAddressNotFoundError);
  });
});
