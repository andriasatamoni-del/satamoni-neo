import { branchScopeOf, canAccessBranch, COMPANY_WIDE_ROLES } from "../../../src/shared/authorization/branch-scope";

// BL-11 policy: scope comes ONLY from the authenticated identity (role + assigned branch) - never from permissions or client input.
describe("branch scope policy", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  test("admin and accountant are company-wide, regardless of a branch assignment", () => {
    expect(COMPANY_WIDE_ROLES).toEqual(["admin", "accountant"]);
    expect(branchScopeOf({ role: "admin", branchId: null })).toEqual({ kind: "all" });
    expect(branchScopeOf({ role: "accountant", branchId: A })).toEqual({ kind: "all" });
  });

  test("every other role is bound to its branch; without a branch it has NO access (fail closed)", () => {
    for (const role of ["branch_manager", "cashier", "driver", "employee"] as const) {
      expect(branchScopeOf({ role, branchId: A })).toEqual({ kind: "branch", branchId: A });
      expect(branchScopeOf({ role, branchId: null })).toEqual({ kind: "none" });
    }
  });

  test("callcenter is company-wide only while it has no branch", () => {
    expect(branchScopeOf({ role: "callcenter", branchId: null })).toEqual({ kind: "all" });
    expect(branchScopeOf({ role: "callcenter", branchId: A })).toEqual({ kind: "branch", branchId: A });
  });

  test("canAccessBranch: own branch yes, other / empty / missing no", () => {
    const scope = branchScopeOf({ role: "cashier", branchId: A });
    expect(canAccessBranch(scope, A)).toBe(true);
    expect(canAccessBranch(scope, B)).toBe(false);
    expect(canAccessBranch(scope, null)).toBe(false);
    expect(canAccessBranch(scope, undefined)).toBe(false);
    expect(canAccessBranch({ kind: "all" }, B)).toBe(true);
    expect(canAccessBranch({ kind: "none" }, A)).toBe(false);
  });
});
