import { RoleDefinition } from "../../../src/contexts/identity-access/domain/role-definition.aggregate";
import {
  FullAccessRoleLockedError,
  RoleLabelRequiredError,
  RolesManageIsFullAccessOnlyError,
} from "../../../src/contexts/identity-access/domain/errors";

const storedRole = (key: string, fullAccess: boolean) =>
  RoleDefinition.reconstitute(key, { label: key, scope: fullAccess ? "company" : "branch", fullAccess, sortOrder: 1, permissions: [] });

describe("RoleDefinition", () => {
  it("registers a role with a generated key, trimmed label and deduped permissions", () => {
    const role = RoleDefinition.register({ label: "  مشرف صالة ", scope: "branch", permissions: ["orders.view", "orders.view"], sortOrder: 8 });
    expect(role.key).toMatch(/^role_[0-9a-f]{8}$/);
    expect(role.label).toBe("مشرف صالة");
    expect(role.scope).toBe("branch");
    expect(role.fullAccess).toBe(false);
    expect(role.permissions).toEqual(["orders.view"]);
  });

  it("rejects an empty label", () => {
    expect(() => RoleDefinition.register({ label: "  ", scope: "company", permissions: [], sortOrder: 1 })).toThrow(RoleLabelRequiredError);
  });

  it("never gives identity.roles.manage to a role without full access", () => {
    expect(() => RoleDefinition.register({ label: "x", scope: "company", permissions: ["identity.roles.manage"], sortOrder: 1 })).toThrow(
      RolesManageIsFullAccessOnlyError
    );
    expect(() => storedRole("cashier", false).replacePermissions(["identity.roles.manage"])).toThrow(RolesManageIsFullAccessOnlyError);
  });

  it("locks the permissions, scope and existence of a full-access role but allows renaming it", () => {
    const owner = storedRole("admin", true);
    expect(() => owner.replacePermissions([])).toThrow(FullAccessRoleLockedError);
    expect(() => owner.changeScope("branch")).toThrow(FullAccessRoleLockedError);
    expect(() => owner.assertDeletable()).toThrow(FullAccessRoleLockedError);
    owner.rename("المالك");
    expect(owner.label).toBe("المالك");
  });

  it("lets any other stored role be renamed, rescoped, re-permissioned and deleted", () => {
    const cashier = storedRole("cashier", false);
    cashier.replacePermissions(["orders.view"]);
    cashier.rename("كاشير صالة");
    cashier.changeScope("company");
    expect(cashier.permissions).toEqual(["orders.view"]);
    expect(cashier.label).toBe("كاشير صالة");
    expect(cashier.scope).toBe("company");
    expect(() => cashier.assertDeletable()).not.toThrow();
  });
});
