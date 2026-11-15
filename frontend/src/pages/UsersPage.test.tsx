import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { UsersPage } from "./UsersPage";
import { renderWithAuth } from "../test/render";
import { apiMock } from "../test/apiMock";
import { seededUser } from "../test/seedRoles";
import { apiRequest } from "../shared/api/client";

vi.mock("../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const ROLES = [
  { key: "admin", label: "أدمن", scope: "company", fullAccess: true, permissions: [], userCount: 1 },
  { key: "cashier", label: "كاشير", scope: "branch", fullAccess: false, permissions: ["orders.view"], userCount: 2 },
  { key: "role_abc12345", label: "مشرف صالة", scope: "branch", fullAccess: false, permissions: ["orders.view"], userCount: 0 },
];

const CATALOG = {
  catalog: [
    { group: "orders", groupLabel: "الطلبات", permissions: [{ key: "orders.view", label: "عرض الطلبات" }] },
    { group: "identity", groupLabel: "الهوية والوصول", permissions: [{ key: "identity.roles.manage", label: "إدارة صلاحيات الأدوار" }] },
  ],
  rolePermissions: { admin: [], cashier: ["orders.view"], role_abc12345: ["orders.view"] },
  roles: ROLES.map(({ key, label, scope, fullAccess }) => ({ key, label, scope, fullAccess })),
};

beforeEach(() => {
  apiMock.reset();
  vi.mocked(apiRequest).mockClear();
  apiMock.responses = { "/roles": ROLES, "/users/permissions-catalog": CATALOG, "/users": { items: [], total: 0 } };
});

describe("UsersPage roles tab", () => {
  it("is hidden from users without identity.roles.manage", async () => {
    renderWithAuth(<UsersPage />, { user: seededUser("branch_manager", { permissions: ["identity.users.view"] }), route: "/users" });
    expect(await screen.findByText(/المستخدمين \(0\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "الأدوار" })).toBeNull();
  });

  it("lists roles with their scope; only the full-access role can never be deleted", async () => {
    renderWithAuth(<UsersPage />, { user: seededUser("admin"), route: "/users?tab=roles" });
    const customRow = (await screen.findByText("مشرف صالة")).closest("tr")!;
    expect(within(customRow).getByText("مربوط بفرع المستخدم")).toBeTruthy();
    expect((within(customRow).getByRole("button", { name: "مسح" }) as HTMLButtonElement).disabled).toBe(false);

    const cashierRow = screen.getByText("كاشير").closest("tr")!;
    expect((within(cashierRow).getByRole("button", { name: "مسح" }) as HTMLButtonElement).disabled).toBe(true);

    const adminRow = screen.getByText("أدمن").closest("tr")!;
    expect(within(adminRow).getByText("كل الصلاحيات")).toBeTruthy();
    expect(within(adminRow).queryByRole("button", { name: "مسح" })).toBeNull();
  });

  it("creates a generic role with the chosen permissions, never offering identity.roles.manage", async () => {
    renderWithAuth(<UsersPage />, { user: seededUser("admin"), route: "/users?tab=roles" });
    const addRole = (await screen.findByRole("button", { name: "+ دور جديد" })) as HTMLButtonElement;
    await vi.waitFor(() => expect(addRole.disabled).toBe(false));
    fireEvent.click(addRole);

    fireEvent.change(screen.getByPlaceholderText("مثلًا: مشرف صالة"), { target: { value: "مراقب" } });
    fireEvent.click(screen.getByLabelText(/^عام/));
    fireEvent.click(screen.getByLabelText("عرض الطلبات"));
    expect((screen.getByLabelText(/إدارة صلاحيات الأدوار/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "إضافة الدور" }));

    await vi.waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/roles", { method: "POST", body: { label: "مراقب", scope: "company", permissions: ["orders.view"] } })
    );
  });
});
