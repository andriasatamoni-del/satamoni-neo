import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Tabs, isTabAllowed, usePermittedTabs, type TabItem } from "./Tabs";
import { PERMISSION } from "../auth/permissions";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";

vi.mock("../api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

beforeEach(() => apiMock.reset());

const TABS: TabItem[] = [
  { key: "audit", label: "Audit", perm: PERMISSION.AUDIT_VIEW },
  { key: "orders", label: "Orders", perm: [PERMISSION.ORDERS_VIEW, PERMISSION.ORDERS_CREATE] },
  { key: "open", label: "Open" },
];

function TabsHarness() {
  const { tabs, active, setActive } = usePermittedTabs(TABS);
  return (
    <>
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      <p data-testid="active">{active}</p>
    </>
  );
}

describe("isTabAllowed", () => {
  it("allows tabs without perm and checks single or multiple keys", () => {
    const cashier = seededUser("cashier");
    expect(isTabAllowed(cashier, TABS[0])).toBe(false);
    expect(isTabAllowed(cashier, TABS[1])).toBe(true);
    expect(isTabAllowed(cashier, TABS[2])).toBe(true);
  });

  it("hides companyWideOnly tabs from branch-bound users even when they hold the permission", () => {
    const tab: TabItem = { key: "errors", label: "Errors", perm: PERMISSION.TALABAT_VIEW, companyWideOnly: true };
    expect(isTabAllowed(seededUser("branch_manager"), tab)).toBe(false);
    expect(isTabAllowed(seededUser("cashier"), tab)).toBe(false);
    expect(isTabAllowed(seededUser("accountant"), tab)).toBe(true);
  });
});

describe("Tabs + usePermittedTabs", () => {
  it("hides tabs the user can't use and starts on the first allowed tab", async () => {
    renderWithAuth(<TabsHarness />, { user: seededUser("cashier") });
    expect(await screen.findByRole("button", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Audit" })).not.toBeInTheDocument();
    expect(screen.getByTestId("active")).toHaveTextContent("orders");
  });

  it("shows every tab to a user with all permissions and switches on click", async () => {
    renderWithAuth(<TabsHarness />, { user: seededUser("admin") });
    expect(await screen.findByRole("button", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByTestId("active")).toHaveTextContent("audit");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("active")).toHaveTextContent("open");
  });
});
