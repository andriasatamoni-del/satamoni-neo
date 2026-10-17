import { describe, expect, it } from "vitest";
import { isCompanyWide, can } from "./roles";
import { PERMISSION } from "./permissions";
import { seededUser } from "../../test/seedRoles";

describe("can", () => {
  const user = { permissions: [PERMISSION.ORDERS_VIEW, PERMISSION.KITCHEN_VIEW] };

  it("allows a permission the user has", () => {
    expect(can(user, PERMISSION.ORDERS_VIEW)).toBe(true);
  });

  it("denies a permission the user lacks", () => {
    expect(can(user, PERMISSION.ACCOUNTING_VIEW)).toBe(false);
  });

  it("allows when any one of several keys matches (same as @RequirePermission)", () => {
    expect(can(user, PERMISSION.ACCOUNTING_VIEW, PERMISSION.KITCHEN_VIEW)).toBe(true);
    expect(can(user, PERMISSION.ACCOUNTING_VIEW, PERMISSION.AUDIT_VIEW)).toBe(false);
  });

  it("denies without a user or without any key", () => {
    expect(can(null, PERMISSION.ORDERS_VIEW)).toBe(false);
    expect(can(undefined, PERMISSION.ORDERS_VIEW)).toBe(false);
    expect(can(user)).toBe(false);
  });
});

describe("isCompanyWide", () => {
  it("mirrors the backend branch scope: admin/accountant always, callcenter only without a branch", () => {
    expect(isCompanyWide(seededUser("admin"))).toBe(true);
    expect(isCompanyWide(seededUser("accountant"))).toBe(true);
    expect(isCompanyWide(seededUser("callcenter"))).toBe(true);
    expect(isCompanyWide({ ...seededUser("callcenter"), branchId: "branch-1" })).toBe(false);
    expect(isCompanyWide(seededUser("branch_manager"))).toBe(false);
    expect(isCompanyWide(seededUser("cashier"))).toBe(false);
    expect(isCompanyWide(null)).toBe(false);
  });
});
