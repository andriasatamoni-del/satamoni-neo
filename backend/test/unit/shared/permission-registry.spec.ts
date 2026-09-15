import { PermissionRegistry } from "../../../src/shared/permissions/permission-registry";

describe("PermissionRegistry", () => {
  function buildRegistry() {
    const registry = new PermissionRegistry();
    registry.registerGroup({
      group: "orders",
      groupLabel: "الطلبات",
      permissions: [
        { key: "orders.create", label: "تسجيل طلب" },
        { key: "orders.cancel", label: "إلغاء طلب" },
      ],
    });
    registry.setRoleDefaults("cashier", ["orders.create"]);
    registry.setRoleDefaults("branch_manager", ["orders.create", "orders.cancel"]);
    return registry;
  }

  it("بيرفض تسجيل نفس المجموعة مرتين", () => {
    const registry = buildRegistry();
    expect(() =>
      registry.registerGroup({ group: "orders", groupLabel: "x", permissions: [] })
    ).toThrow();
  });

  it("isKnownPermission بيتعرف بس على المفاتيح المسجّلة", () => {
    const registry = buildRegistry();
    expect(registry.isKnownPermission("orders.create")).toBe(true);
    expect(registry.isKnownPermission("ghost.permission")).toBe(false);
  });

  it("hasPermission بيرجع صح لو الصلاحية من ضمن دور المستخدم الافتراضية", () => {
    const registry = buildRegistry();
    expect(registry.hasPermission("cashier", "orders.create")).toBe(true);
    expect(registry.hasPermission("cashier", "orders.cancel")).toBe(false);
  });

  it("revoke بيغلب حتى لو الصلاحية أصلًا من دوره", () => {
    const registry = buildRegistry();
    expect(
      registry.hasPermission("branch_manager", "orders.cancel", { revokes: ["orders.cancel"] })
    ).toBe(false);
  });

  it("grant بيديله صلاحية إضافية مش من دوره الأساسي", () => {
    const registry = buildRegistry();
    expect(registry.hasPermission("cashier", "orders.cancel")).toBe(false);
    expect(
      registry.hasPermission("cashier", "orders.cancel", { grants: ["orders.cancel"] })
    ).toBe(true);
  });

  it("admin بياخد كل الصلاحيات المسجّلة كلها تلقائيًا", () => {
    const registry = buildRegistry();
    expect(registry.hasPermission("admin", "orders.create")).toBe(true);
    expect(registry.hasPermission("admin", "orders.cancel")).toBe(true);
  });

  it("revoke بيغلب حتى صلاحية الأدمن الشاملة", () => {
    const registry = buildRegistry();
    expect(registry.hasPermission("admin", "orders.cancel", { revokes: ["orders.cancel"] })).toBe(
      false
    );
  });
});
