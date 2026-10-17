import { describe, expect, it } from "vitest";
import { STAFF_ROUTES, canOpenPath, canOpenRoute, navItemsFor } from "./routes";
import { seededUser } from "./test/seedRoles";
import { ROLES, type Role } from "./shared/auth/roles";

const navPaths = (role: Role) => navItemsFor(seededUser(role)).map((i) => i.to);

describe("STAFF_ROUTES", () => {
  it("has unique paths", () => {
    const paths = STAFF_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("never uses an empty permission list (that would hide the page from everyone)", () => {
    for (const route of STAFF_ROUTES) {
      if (route.perm !== null) expect(route.perm.length, route.path).toBeGreaterThan(0);
    }
  });
});

describe("sidebar per seeded role", () => {
  it("admin sees every page", () => {
    expect(navPaths("admin")).toEqual(STAFF_ROUTES.map((r) => r.path));
  });

  it("cashier does not see accounting, users, audit log, treasuries or HR", () => {
    const paths = navPaths("cashier");
    for (const hidden of ["/accounting", "/users", "/audit-log", "/treasuries", "/hr-payroll"]) {
      expect(paths).not.toContain(hidden);
    }
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/me", "/orders", "/kds", "/catalog", "/expenses", "/purchases", "/printing"])
    );
  });

  it("employee only sees home and their own profile", () => {
    expect(navPaths("employee")).toEqual(["/", "/me"]);
  });

  it("driver sees delivery and system settings but no POS", () => {
    expect(navPaths("driver")).toEqual(["/", "/me", "/delivery", "/pos-settings"]);
  });

  it("callcenter sees CRM, WhatsApp and the menu", () => {
    expect(navPaths("callcenter")).toEqual(["/", "/me", "/crm", "/whatsapp", "/catalog", "/talabat"]);
  });

  it("every role sees home and their profile", () => {
    for (const role of ROLES) expect(navPaths(role).slice(0, 2), role).toEqual(["/", "/me"]);
  });
});

describe("route access", () => {
  it("a route without perm is open to any logged-in user only", () => {
    expect(canOpenRoute(seededUser("employee"), { perm: null })).toBe(true);
    expect(canOpenRoute(null, { perm: null })).toBe(false);
  });

  it("canOpenPath follows the route config and ignores query strings", () => {
    expect(canOpenPath(seededUser("cashier"), "/orders?tab=x")).toBe(true);
    expect(canOpenPath(seededUser("cashier"), "/accounting")).toBe(false);
  });

  it("canOpenPath leaves unknown paths visible (the router shows NotFound)", () => {
    expect(canOpenPath(seededUser("employee"), "/no-such-page")).toBe(true);
  });

  it("follows permission edits, not roles: a cashier given accounting.view can open accounting", () => {
    const cashier = seededUser("cashier");
    const edited = { ...cashier, permissions: [...cashier.permissions, "accounting.view" as const] };
    expect(navItemsFor(edited).map((i) => i.to)).toContain("/accounting");
  });
});
