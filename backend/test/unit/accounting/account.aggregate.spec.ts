import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";
import { AccountCodeRequiredError, UnknownAccountTypeError } from "../../../src/contexts/accounting/domain/errors";

describe("Account aggregate", () => {
  it("بيسجّل حساب صحيح", () => {
    const account = Account.register({ code: "1010", name: "الصندوق", accountType: "ASSET" });
    expect(account.isActive).toBe(true);
    expect(account.isSystemAccount).toBe(false);
  });

  it("بيرفض كود فاضي", () => {
    expect(() => Account.register({ code: "  ", name: "الصندوق", accountType: "ASSET" })).toThrow(AccountCodeRequiredError);
  });

  it("بيرفض نوع حساب مش معروف", () => {
    expect(() => Account.register({ code: "1010", name: "الصندوق", accountType: "ghost" })).toThrow(UnknownAccountTypeError);
  });

  it("activate/deactivate بيغيّروا isActive", () => {
    const account = Account.register({ code: "1010", name: "الصندوق", accountType: "ASSET" });
    account.deactivate();
    expect(account.isActive).toBe(false);
    account.activate();
    expect(account.isActive).toBe(true);
  });

  describe("updateDetails", () => {
    it("بيحدّث الاسم والنوع والفرع والأب فعليًا (مش بس أول تسجيل)", () => {
      const account = Account.register({ code: "1010", name: "الصندوق", accountType: "ASSET" });
      account.updateDetails({ name: "الصندوق المركزي", accountType: "LIABILITY", parentAccountId: "parent-1", branchId: "branch-1", isActive: false, isSystemAccount: true });
      expect(account.name).toBe("الصندوق المركزي");
      expect(account.accountType).toBe("LIABILITY");
      expect(account.parentAccountId).toBe("parent-1");
      expect(account.branchId).toBe("branch-1");
      expect(account.isActive).toBe(false);
      expect(account.isSystemAccount).toBe(true);
    });

    it("بيرفض نوع حساب مش معروف", () => {
      const account = Account.register({ code: "1010", name: "الصندوق", accountType: "ASSET" });
      expect(() => account.updateDetails({ name: "الصندوق", accountType: "ghost" })).toThrow(UnknownAccountTypeError);
    });
  });
});
