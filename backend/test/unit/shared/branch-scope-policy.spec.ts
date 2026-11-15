import { branchScopeOf, canAccessBranch } from "../../../src/shared/authorization/branch-scope";
import type { RoleScope } from "../../../src/contexts/identity-access/domain/role";

describe("branch scope policy", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const scopeOf = (roleScopes: RoleScope[], branchId: string | null) => branchScopeOf({ roleScopes, branchId });

  test("a company role is company-wide, regardless of a branch assignment", () => {
    expect(scopeOf(["company"], null)).toEqual({ kind: "all" });
    expect(scopeOf(["company"], A)).toEqual({ kind: "all" });
  });

  test("a branch role is bound to the user's branch; without a branch it has NO access (fail closed)", () => {
    expect(scopeOf(["branch"], A)).toEqual({ kind: "branch", branchId: A });
    expect(scopeOf(["branch"], null)).toEqual({ kind: "none" });
  });

  test("a user with several roles is company-wide when any of them is, otherwise bound to the branch", () => {
    expect(scopeOf(["branch", "company"], A)).toEqual({ kind: "all" });
    expect(scopeOf(["company", "branch"], null)).toEqual({ kind: "all" });
    expect(scopeOf(["branch", "branch"], A)).toEqual({ kind: "branch", branchId: A });
    expect(scopeOf(["branch", "branch"], null)).toEqual({ kind: "none" });
  });

  test("no roles at all is fail closed", () => {
    expect(scopeOf([], A)).toEqual({ kind: "branch", branchId: A });
    expect(scopeOf([], null)).toEqual({ kind: "none" });
  });

  test("canAccessBranch: own branch yes, other / empty / missing no", () => {
    const scope = scopeOf(["branch"], A);
    expect(canAccessBranch(scope, A)).toBe(true);
    expect(canAccessBranch(scope, B)).toBe(false);
    expect(canAccessBranch(scope, null)).toBe(false);
    expect(canAccessBranch(scope, undefined)).toBe(false);
    expect(canAccessBranch({ kind: "all" }, B)).toBe(true);
    expect(canAccessBranch({ kind: "none" }, A)).toBe(false);
  });
});
