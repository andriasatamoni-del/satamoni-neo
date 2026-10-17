import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { App } from "./App";
import { renderWithAuth } from "./test/render";
import { apiMock } from "./test/apiMock";
import { seededUser } from "./test/seedRoles";
import { PERMISSION } from "./shared/auth/permissions";

vi.mock("./shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("./test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

beforeEach(() => apiMock.reset());

describe("App routing", () => {
  it("shows NoAccess instead of the page when the user's roles don't allow the route", async () => {
    renderWithAuth(<App />, { user: seededUser("cashier"), route: "/accounting" });
    expect(await screen.findByText("معندكش صلاحية تفتح الصفحة دي")).toBeInTheDocument();
    // the page never mounted, so none of its endpoints were called
    expect(apiMock.calls.filter((c) => c.startsWith("/accounting"))).toEqual([]);
  });

  it("renders the page when the user has one of the route's permissions", async () => {
    // /purchases accepts purchases.view or purchases.view_own_daily; the cashier only has the second one
    const cashier = seededUser("cashier");
    expect(cashier.permissions).toContain(PERMISSION.PURCHASES_VIEW_OWN_DAILY);
    expect(cashier.permissions).not.toContain(PERMISSION.PURCHASES_VIEW);
    renderWithAuth(<App />, { user: cashier, route: "/purchases" });
    expect(await screen.findByRole("heading", { name: "المشتريات النقدية" })).toBeInTheDocument();
  });

  it("shows NotFound for an unknown URL", async () => {
    renderWithAuth(<App />, { user: seededUser("cashier"), route: "/no-such-page" });
    expect(await screen.findByText("الصفحة دي مش موجودة")).toBeInTheDocument();
  });

  it("redirects a logged-out visitor to the login page", async () => {
    renderWithAuth(<App />, { user: null, route: "/accounting" });
    expect(await screen.findByRole("button", { name: /دخول/ })).toBeInTheDocument();
    expect(screen.queryByText("معندكش صلاحية تفتح الصفحة دي")).not.toBeInTheDocument();
  });

  it("only lists the links the user can open in the sidebar", async () => {
    renderWithAuth(<App />, { user: seededUser("cashier"), route: "/" });
    expect((await screen.findAllByRole("link", { name: "الطلبات (POS)" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "المحاسبة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "المستخدمين" })).not.toBeInTheDocument();
  });

  it("does not call endpoints the cashier can't use on the home page", async () => {
    renderWithAuth(<App />, { user: seededUser("cashier"), route: "/" });
    await screen.findAllByRole("link", { name: "الطلبات (POS)" });
    expect(apiMock.calls).not.toContain("/reports/action-center");
    expect(apiMock.calls.some((c) => c.startsWith("/reports/dashboard"))).toBe(false);
    expect(apiMock.calls).not.toContain("/branches");
  });
});
