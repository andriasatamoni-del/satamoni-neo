import { branchScopeOf, canAccessBranch, COMPANY_WIDE_ROLES } from "../../../src/shared/authorization/branch-scope";

// BL-11 policy: scope comes ONLY from the authenticated identity (roles + assigned branch) - never from permissions or client input.
describe("branch scope policy", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  test("admin and accountant are company-wide, regardless of a branch assignment", () => {
    expect(COMPANY_WIDE_ROLES).toEqual(["admin", "accountant"]);
    expect(branchScopeOf({ roles: ["admin"], branchId: null })).toEqual({ kind: "all" });
    expect(branchScopeOf({ roles: ["accountant"], branchId: A })).toEqual({ kind: "all" });
  });

  test("every other role is bound to its branch; without a branch it has NO access (fail closed)", () => {
    for (const role of ["branch_manager", "cashier", "driver", "employee"] as const) {
      expect(branchScopeOf({ roles: [role], branchId: A })).toEqual({ kind: "branch", branchId: A });
      expect(branchScopeOf({ roles: [role], branchId: null })).toEqual({ kind: "none" });
    }
  });

  test("callcenter is company-wide only while it has no branch", () => {
    expect(branchScopeOf({ roles: ["callcenter"], branchId: null })).toEqual({ kind: "all" });
    expect(branchScopeOf({ roles: ["callcenter"], branchId: A })).toEqual({ kind: "branch", branchId: A });
  });

  test("a user with several roles is company-wide when any of them is, otherwise bound to the branch", () => {
    expect(branchScopeOf({ roles: ["cashier", "accountant"], branchId: A })).toEqual({ kind: "all" });
    expect(branchScopeOf({ roles: ["branch_manager", "admin"], branchId: A })).toEqual({ kind: "all" });
    expect(branchScopeOf({ roles: ["callcenter", "cashier"], branchId: null })).toEqual({ kind: "all" });
    expect(branchScopeOf({ roles: ["callcenter", "cashier"], branchId: A })).toEqual({ kind: "branch", branchId: A });
    expect(branchScopeOf({ roles: ["branch_manager", "cashier"], branchId: A })).toEqual({ kind: "branch", branchId: A });
    expect(branchScopeOf({ roles: ["branch_manager", "cashier"], branchId: null })).toEqual({ kind: "none" });
  });

  test("no roles at all is fail closed", () => {
    expect(branchScopeOf({ roles: [], branchId: A })).toEqual({ kind: "branch", branchId: A });
    expect(branchScopeOf({ roles: [], branchId: null })).toEqual({ kind: "none" });
  });

  test("canAccessBranch: own branch yes, other / empty / missing no", () => {
    const scope = branchScopeOf({ roles: ["cashier"], branchId: A });
    expect(canAccessBranch(scope, A)).toBe(true);
    expect(canAccessBranch(scope, B)).toBe(false);
    expect(canAccessBranch(scope, null)).toBe(false);
    expect(canAccessBranch(scope, undefined)).toBe(false);
    expect(canAccessBranch({ kind: "all" }, B)).toBe(true);
    expect(canAccessBranch({ kind: "none" }, A)).toBe(false);
  });
});
