import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { OWN_BRANCH_LABEL, useBranchOptions } from "./useBranchOptions";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";

vi.mock("../api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

beforeEach(() => apiMock.reset());

function BranchList({ enabled = true }: { enabled?: boolean }) {
  const { branches } = useBranchOptions(enabled);
  return <p data-testid="branches">{branches.map((b) => `${b.id}:${b.name}`).join(",")}</p>;
}

describe("useBranchOptions", () => {
  it("fetches /branches for a user with branches.view", async () => {
    apiMock.responses["/branches"] = [{ id: "b1", name: "Maadi" }, { id: "b2", name: "Zayed" }];
    renderWithAuth(<BranchList />, { user: seededUser("branch_manager") });
    await waitFor(() => expect(screen.getByTestId("branches")).toHaveTextContent("b1:Maadi,b2:Zayed"));
  });

  it("falls back to the user's own branch without calling /branches", async () => {
    renderWithAuth(<BranchList />, { user: seededUser("cashier") });
    await waitFor(() => expect(screen.getByTestId("branches")).toHaveTextContent(`branch-1:${OWN_BRANCH_LABEL}`));
    expect(apiMock.calls).not.toContain("/branches");
  });

  it("returns no branches for a company-wide user without branches.view", async () => {
    renderWithAuth(<BranchList />, { user: seededUser("accountant") });
    await waitFor(() => expect(apiMock.calls).toContain("/auth/me"));
    expect(screen.getByTestId("branches")).toHaveTextContent("");
    expect(apiMock.calls).not.toContain("/branches");
  });

  it("does not fetch while disabled", async () => {
    renderWithAuth(<BranchList enabled={false} />, { user: seededUser("admin") });
    await waitFor(() => expect(apiMock.calls).toContain("/auth/me"));
    expect(apiMock.calls).not.toContain("/branches");
  });
});
