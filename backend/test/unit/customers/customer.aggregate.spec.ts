import { Customer } from "../../../src/contexts/customers/domain/customer.aggregate";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressRequiredError,
  CustomerNameRequiredError,
  InvalidPhoneError,
  WeakCustomerPasswordError,
} from "../../../src/contexts/customers/domain/errors";

function register(overrides: Partial<Parameters<typeof Customer.register>[0]> = {}) {
  return Customer.register({ phone: "01012345678", name: "أحمد", passwordHash: "hashed", ...overrides });
}

describe("Customer aggregate", () => {
  it("بيسجّل عميل صحيح، وبينضّف رقم التليفون من مسافات/شرطات", () => {
    const customer = register({ phone: "010 1234-5678" });
    expect(customer.phone).toBe("01012345678");
    expect(customer.hasAccount).toBe(true);
    expect(customer.loyaltyPoints).toBe(0);
    expect(customer.isBlocked).toBe(false);
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
      phone: "01012345678", phone2: null, name: null, addressDetails: null, distinguishingMark: null,
      notes: null, loyaltyPoints: 50, passwordHash: null, isBlocked: false, blockReason: null,
      blockedBy: null, blockedAt: null, addresses: [], legacyCustomerId: null, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(guest.hasAccount).toBe(false);
    guest.activateAccount({ name: "محمد", passwordHash: "hashed-2" });
    expect(guest.hasAccount).toBe(true);
    expect(guest.name).toBe("محمد");
    expect(guest.loyaltyPoints).toBe(50);
  });

  it("activateAccount برفض لو الحساب موجود بالفعل", () => {
    const customer = register();
    expect(() => customer.activateAccount({ name: "تاني", passwordHash: "x" })).toThrow(CustomerAccountAlreadyExistsError);
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

  it("addAddress بيرفض عنوان فاضي، وبيسجّل واحد بس افتراضي في نفس الوقت", () => {
    const customer = register();
    expect(() => customer.addAddress({ addressDetails: "  " })).toThrow(CustomerAddressRequiredError);

    customer.addAddress({ addressDetails: "عنوان 1", isDefault: true });
    customer.addAddress({ addressDetails: "عنوان 2", isDefault: true });
    expect(customer.addresses).toHaveLength(2);
    expect(customer.addresses.filter((a) => a.isDefault)).toHaveLength(1);
    expect(customer.addresses[1].isDefault).toBe(true);
  });
});
