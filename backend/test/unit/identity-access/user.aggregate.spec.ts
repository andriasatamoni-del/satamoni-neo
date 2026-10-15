import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";
import {
  InvalidEmailError,
  InvalidRoleError,
  RolesRequiredError,
  WeakPasswordError,
} from "../../../src/contexts/identity-access/domain/errors";

describe("User aggregate", () => {
  describe("register", () => {
    it("بيعمل يوزر صحيح بقيم افتراضية سليمة", () => {
      const user = User.register({
        name: "  أحمد  ",
        email: "  Ahmed@Example.com ",
        passwordHash: "hashed",
        roles: ["cashier"],
      });
      expect(user.id).toBeTruthy();
      expect(user.name).toBe("أحمد");
      expect(user.email).toBe("ahmed@example.com"); // trimmed + lowercased
      expect(user.roles).toEqual(["cashier"]);
      expect(user.isActive).toBe(true);
      expect(user.pinHash).toBeNull();
    });

    it("بيرفض إيميل غلط", () => {
      expect(() =>
        User.register({ name: "أحمد", email: "not-an-email", passwordHash: "h", roles: ["cashier"] })
      ).toThrow(InvalidEmailError);
    });

    it("بيرفض دور مش معروف", () => {
      expect(() =>
        User.register({ name: "أحمد", email: "a@b.com", passwordHash: "h", roles: ["superadmin"] })
      ).toThrow(InvalidRoleError);
    });

    it("بيرفض مستخدم من غير ولا دور", () => {
      expect(() => User.register({ name: "أحمد", email: "a@b.com", passwordHash: "h", roles: [] })).toThrow(RolesRequiredError);
    });

    it("بيقبل أكتر من دور، من غير تكرار وبترتيب ثابت (ترتيب ROLES)", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", roles: ["cashier", "branch_manager", "cashier"] });
      expect(user.roles).toEqual(["branch_manager", "cashier"]);
    });
  });

  describe("validatePasswordPolicy", () => {
    it("بيرفض باسورد أقل من 8 حروف", () => {
      expect(() => User.validatePasswordPolicy("short")).toThrow(WeakPasswordError);
    });

    it("بيقبل باسورد 8 حروف أو أكتر", () => {
      expect(() => User.validatePasswordPolicy("12345678")).not.toThrow();
    });
  });

  describe("activate/deactivate", () => {
    it("deactivate بيقفل isActive و activate بيرجعه", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", roles: ["cashier"] });
      user.deactivate();
      expect(user.isActive).toBe(false);
      user.activate();
      expect(user.isActive).toBe(true);
    });
  });

  describe("changeRoles", () => {
    it("بيرفض دور مش معروف ومايغيّرش الأدوار الحالية", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", roles: ["cashier"] });
      expect(() => user.changeRoles(["branch_manager", "ghost"])).toThrow(InvalidRoleError);
      expect(user.roles).toEqual(["cashier"]);
    });

    it("بيرفض قايمة فاضية ومايغيّرش الأدوار الحالية", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", roles: ["cashier"] });
      expect(() => user.changeRoles([])).toThrow(RolesRequiredError);
      expect(user.roles).toEqual(["cashier"]);
    });

    it("بيستبدل الأدوار كلها لو صحيحة", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", roles: ["cashier"] });
      user.changeRoles(["accountant", "branch_manager"]);
      expect(user.roles).toEqual(["branch_manager", "accountant"]);
    });
  });
});
