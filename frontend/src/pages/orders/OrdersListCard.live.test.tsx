import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { OrdersListCard, useOrdersListState } from "./OrdersListCard";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";
import type { Order, OrderLine } from "./posTypes";
import { LIVE_STALE_AFTER_MS } from "../../shared/api/orderLiveUpdates";

vi.mock("../../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const BRANCH = "branch-1";

function order(id: string, createdBy = "user-callcenter"): Order {
  return {
    id,
    branchId: BRANCH,
    orderType: "takeaway",
    tableNumber: null,
    customerName: null,
    customerPhone: null,
    items: [{ id: `${id}-line`, menuItemId: "m1", variantId: "v1", comboId: null, quantity: 1, unitPrice: 50, lineTotal: 50, addons: [] }],
    subtotal: 50,
    discount: 0,
    total: 50,
    status: "preparing",
    kitchenStatus: "NEW",
    paymentMethodId: null,
    source: "pos",
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

function setOrders(list: Order[]) {
  apiMock.responses["/orders"] = { items: list, total: list.length, limit: 20, offset: 0 };
}

interface FakeStream {
  url: string;
  signal: AbortSignal;
  closed: boolean;
  push(type: string, data?: unknown): void;
  close(): void;
}

const streams: FakeStream[] = [];
const encoder = new TextEncoder();

function installFakeEventSource() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
      const signal = init.signal as AbortSignal;
      signal.addEventListener("abort", () => {
        try { controller.error(new DOMException("aborted", "AbortError")); } catch { return; }
      });
      const stream: FakeStream = {
        url,
        signal,
        closed: false,
        close: () => {
          stream.closed = true;
          controller.close();
        },
        push: (type, data = "") => controller.enqueue(encoder.encode(`event: ${type}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`)),
      };
      streams.push(stream);
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    })
  );
}

const openStreams = () => streams.filter((s) => !s.signal.aborted && !s.closed);

function Screen() {
  const listState = useOrdersListState();
  return <OrdersListCard listState={listState} branchId={BRANCH} canManageOrders={false} describeOrderLine={(l: OrderLine) => `بند ${l.id}`} />;
}

async function renderCashierScreen() {
  renderWithAuth(<StrictMode><Screen /></StrictMode>, { user: seededUser("cashier"), route: "/orders" });
  await screen.findByText(/بند A-line/);
  await waitFor(() => expect(openStreams()).toHaveLength(1));
  return openStreams()[0];
}

const rowsOf = (id: string) => screen.queryAllByRole("row").filter((row) => row.textContent?.includes(`بند ${id}-line`)).length;

beforeEach(() => {
  apiMock.reset();
  streams.length = 0;
  setOrders([order("A")]);
  installFakeEventSource();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const orderListFetches = () => apiMock.calls.filter((c) => c.startsWith("/orders?")).length;

describe("POS orders list live updates", () => {
  it("keeps a single live connection for the branch, even under StrictMode", async () => {
    const stream = await renderCashierScreen();
    expect(stream.url).toContain(`/orders/live?branchId=${BRANCH}`);
    await act(async () => stream.push("ready"));
    expect(await screen.findByText("مباشر")).toBeTruthy();
    expect(openStreams()).toHaveLength(1);
  });

  it("shows a pushed call-center order immediately and exactly once", async () => {
    const stream = await renderCashierScreen();
    await act(async () => stream.push("ready"));
    const fetchesBefore = apiMock.calls.filter((c) => c.startsWith("/orders?")).length;

    setOrders([order("B"), order("A")]);
    await act(async () => stream.push("order", { change: "registered", orderId: "B", branchId: BRANCH }));

    await waitFor(() => expect(rowsOf("B")).toBe(1));
    expect(rowsOf("A")).toBe(1);
    expect(apiMock.calls.filter((c) => c.startsWith("/orders?")).length).toBeGreaterThan(fetchesBefore);
    expect(await screen.findByText("وصل طلب جديد")).toBeTruthy();
  });

  it("does not duplicate rows or the new-order alert when the same order changes several times", async () => {
    const stream = await renderCashierScreen();
    await act(async () => stream.push("ready"));

    setOrders([order("B"), order("A")]);
    await act(async () => {
      stream.push("order", { change: "registered", orderId: "B", branchId: BRANCH });
      stream.push("order", { change: "kitchen", orderId: "B", branchId: BRANCH });
      stream.push("order", { change: "registered", orderId: "B", branchId: BRANCH });
    });
    await waitFor(() => expect(rowsOf("B")).toBe(1));
    await act(async () => stream.push("order", { change: "status", orderId: "B", branchId: BRANCH }));
    await waitFor(() => expect(apiMock.calls.filter((c) => c.startsWith("/orders?")).length).toBeGreaterThan(2));

    expect(rowsOf("B")).toBe(1);
    expect(rowsOf("A")).toBe(1);
    expect(screen.getByText("وصل طلب جديد")).toBeTruthy();
    expect(screen.queryByText(/وصلت \d+ طلبات جديدة/)).toBeNull();
  });

  it("does not alert the cashier for an order they placed themselves", async () => {
    const stream = await renderCashierScreen();
    await act(async () => stream.push("ready"));

    setOrders([order("C", "user-cashier"), order("A")]);
    await act(async () => stream.push("order", { change: "registered", orderId: "C", branchId: BRANCH }));

    await waitFor(() => expect(rowsOf("C")).toBe(1));
    expect(screen.queryByText("وصل طلب جديد")).toBeNull();
  });

  it("reconnects after the server ends the stream and still shows each order once", async () => {
    const first = await renderCashierScreen();
    await act(async () => first.push("ready"));
    await act(async () => first.close());
    expect(await screen.findByText("بيتحدّث كل 10 ثواني")).toBeTruthy();

    await waitFor(() => expect(openStreams()).toHaveLength(1), { timeout: 3000 });
    const second = openStreams()[0];
    expect(second).not.toBe(first);
    await act(async () => second.push("ready"));
    expect(await screen.findByText("مباشر")).toBeTruthy();

    setOrders([order("D"), order("A")]);
    await act(async () => second.push("order", { change: "registered", orderId: "D", branchId: BRANCH }));
    await waitFor(() => expect(rowsOf("D")).toBe(1));
    expect(rowsOf("A")).toBe(1);
    expect(openStreams()).toHaveLength(1);
  });

  it("makes no background requests while the live stream is healthy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stream = await renderCashierScreen();
    await act(async () => stream.push("ready"));
    expect(await screen.findByText("مباشر")).toBeTruthy();
    const fetchesWhileLive = orderListFetches();

    for (let i = 0; i < 9; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
        stream.push("ping");
      });
    }

    expect(orderListFetches()).toBe(fetchesWhileLive);
    expect(openStreams()).toEqual([stream]);
    expect(screen.getByText("مباشر")).toBeTruthy();
  });

  it("drops a silent connection and reconnects once heartbeats stop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = await renderCashierScreen();
    await act(async () => first.push("ready"));
    expect(await screen.findByText("مباشر")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_STALE_AFTER_MS + 100);
    });
    expect(first.signal.aborted).toBe(true);
    expect(await screen.findByText("بيتحدّث كل 10 ثواني")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    await waitFor(() => expect(openStreams()).toHaveLength(1));
    const second = openStreams()[0];
    expect(second).not.toBe(first);
    await act(async () => second.push("ready"));
    expect(await screen.findByText("مباشر")).toBeTruthy();

    setOrders([order("E"), order("A")]);
    await act(async () => second.push("order", { change: "payment", orderId: "A", branchId: BRANCH }));
    await act(async () => second.push("order", { change: "registered", orderId: "E", branchId: BRANCH }));
    await waitFor(() => expect(rowsOf("E")).toBe(1));
    expect(rowsOf("A")).toBe(1);
  });
});
