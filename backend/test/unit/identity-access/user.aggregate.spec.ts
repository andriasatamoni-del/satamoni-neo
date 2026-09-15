import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";
import {
  InvalidEmailError,
  InvalidRoleError,
  WeakPasswordError,
} from "../../../src/contexts/identity-access/domain/errors";

describe("User aggregate", () => {
  describe("register", () => {
    it("بيعمل يوزر صحيح بقيم افتراضية سليمة", () => {
      const user = User.register({
        name: "  أحمد  ",
        email: "  Ahmed@Example.com ",
        passwordHash: "hashed",
        role: "cashier",
      });
      expect(user.id).toBeTruthy();
      expect(user.name).toBe("أحمد");
      expect(user.email).toBe("ahmed@example.com"); // trimmed + lowercased
      expect(user.role).toBe("cashier");
      expect(user.isActive).toBe(true);
      expect(user.permissionGrants).toEqual([]);
      expect(user.permissionRevokes).toEqual([]);
      expect(user.pinHash).toBeNull();
    });

    it("بيرفض إيميل غلط", () => {
      expect(() =>
        User.register({ name: "أحمد", email: "not-an-email", passwordHash: "h", role: "cashier" })
      ).toThrow(InvalidEmailError);
    });

    it("بيرفض دور مش معروف", () => {
      expect(() =>
        User.register({ name: "أحمد", email: "a@b.com", passwordHash: "h", role: "superadmin" })
      ).toThrow(InvalidRoleError);
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

  describe("permission overrides", () => {
    it("grantPermission بيضيف للـgrants ويشيلها من الـrevokes لو موجودة", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      user.revokePermission("orders.create");
      expect(user.permissionRevokes).toContain("orders.create");
      user.grantPermission("orders.create");
      expect(user.permissionGrants).toContain("orders.create");
      expect(user.permissionRevokes).not.toContain("orders.create");
    });

    it("revokePermission بيضيف للـrevokes ويشيلها من الـgrants لو موجودة", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      user.grantPermission("orders.create");
      user.revokePermission("orders.create");
      expect(user.permissionGrants).not.toContain("orders.create");
      expect(user.permissionRevokes).toContain("orders.create");
    });

    it("replacePermissionOverrides بيحسب الفرق صح مقابل صلاحيات الدور الافتراضية", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      const roleDefaults = new Set(["orders.create", "shifts.open_own"]);
      // الأدمن علّم orders.create (موجودة أصلًا في الدور - مفيش تأثير) + payslips.view_own (إضافية)
      // وشال shifts.open_own (موجودة في الدور - لازم تتحول revoke)
      user.replacePermissionOverrides(["orders.create", "payslips.view_own"], roleDefaults);
      expect(user.permissionGrants).toEqual(["payslips.view_own"]);
      expect(user.permissionRevokes).toEqual(["shifts.open_own"]);
    });
  });

  describe("activate/deactivate", () => {
    it("deactivate بيقفل isActive و activate بيرجعه", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      user.deactivate();
      expect(user.isActive).toBe(false);
      user.activate();
      expect(user.isActive).toBe(true);
    });
  });

  describe("changeRole", () => {
    it("بيرفض دور مش معروف ومايغيّرش الدور الحالي", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      expect(() => user.changeRole("ghost")).toThrow(InvalidRoleError);
      expect(user.role).toBe("cashier");
    });

    it("بيغيّر الدور لو صحيح", () => {
      const user = User.register({ name: "أ", email: "a@b.com", passwordHash: "h", role: "cashier" });
      user.changeRole("branch_manager");
      expect(user.role).toBe("branch_manager");
    });
  });
});
