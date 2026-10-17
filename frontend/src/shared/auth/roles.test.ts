import { describe, expect, it } from "vitest";
import { can } from "./roles";
import { PERMISSION } from "./permissions";

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
