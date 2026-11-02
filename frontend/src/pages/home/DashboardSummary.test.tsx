import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { DashboardSummary } from "./DashboardSummary";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";

vi.mock("../../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const SUMMARY = {
  from: "", to: "", revenue: 0, orderCount: 0, cancelledCount: 0, avgOrderValue: 0,
  dailyTrend: [], topItemsByRevenue: [], revenueByBranch: [], orderStatusBreakdown: [], paymentMethodBreakdown: [],
};

function dashboardCalls() {
  return apiMock.calls.filter((path) => path.startsWith("/reports/dashboard"));
}

beforeEach(() => {
  apiMock.reset();
  apiMock.responses = { "/reports/dashboard": SUMMARY };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardSummary range buttons", () => {
  it("uses the Cairo calendar date after midnight in Cairo", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T22:39:00Z") });
    renderWithAuth(<DashboardSummary />, { user: seededUser("admin"), route: "/" });

    fireEvent.click(await screen.findByRole("button", { name: "اليوم" }));

    await waitFor(() => expect(dashboardCalls()).toContain("/reports/dashboard?from=2026-11-01&to=2026-11-01"));
  });

  it("requests a new date range for each preset", async () => {
    renderWithAuth(<DashboardSummary />, { user: seededUser("admin"), route: "/" });
    await waitFor(() => expect(dashboardCalls()).toHaveLength(1));

    fireEvent.click(await screen.findByRole("button", { name: "اليوم" }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "آخر 7 أيام" }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(3));

    expect(new Set(dashboardCalls()).size).toBe(3);
  });
});
