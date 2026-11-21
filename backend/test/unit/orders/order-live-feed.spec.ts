import { OrdersModule } from "../../../src/contexts/orders/orders.module";
import { OrderLiveFeed, type OrderLiveEvent } from "../../../src/contexts/orders/application/services/order-live-feed.service";
import type { EventBusService } from "../../../src/shared/events/event-bus.service";
import type { SyncOrderPaymentMethodHandler } from "../../../src/contexts/orders/application/commands/sync-order-payment-method.handler";

type Subscription = { name: string; handler: (event: unknown) => unknown; critical: boolean };

function wireOrdersModule() {
  const subscriptions: Subscription[] = [];
  const bus = {
    subscribe: (name: string, handler: (event: unknown) => unknown, options: { critical?: boolean } = {}) =>
      subscriptions.push({ name, handler, critical: options.critical === true }),
  } as unknown as EventBusService;
  const sync = { handle: jest.fn() } as unknown as SyncOrderPaymentMethodHandler;
  const feed = new OrderLiveFeed();
  const pushed: OrderLiveEvent[] = [];
  feed.forBranch(undefined).subscribe((e) => pushed.push(e));
  new OrdersModule(bus, sync, feed).onModuleInit();
  const fire = (name: string, event: unknown) => subscriptions.filter((s) => s.name === name && !s.critical).forEach((s) => s.handler(event));
  return { subscriptions, pushed, fire };
}

describe("orders live feed wiring", () => {
  it("pushes every order change after commit, never inside the business transaction", () => {
    const { subscriptions } = wireOrdersModule();
    const live = subscriptions.filter((s) => ["OrderRegistered", "OrderStatusChanged", "KitchenStatusAdvanced", "OrderCancelled"].includes(s.name));
    expect(live).toHaveLength(4);
    expect(live.every((s) => !s.critical)).toBe(true);
    expect(subscriptions.filter((s) => s.name === "PaymentAdjustmentApproved" && !s.critical)).toHaveLength(1);
  });

  it("pushes a payment change when an approved adjustment switches the order's payment method", () => {
    const { pushed, fire } = wireOrdersModule();
    fire("PaymentAdjustmentApproved", { orderId: "o1", branchId: "b1", previousPaymentMethodId: "cash", newPaymentMethodId: "visa" });
    expect(pushed).toEqual([{ change: "payment", orderId: "o1", branchId: "b1" }]);
  });

  it("stays quiet when an adjustment keeps the same payment method", () => {
    const { pushed, fire } = wireOrdersModule();
    fire("PaymentAdjustmentApproved", { orderId: "o1", branchId: "b1", previousPaymentMethodId: "cash", newPaymentMethodId: "cash" });
    expect(pushed).toEqual([]);
  });

  it("only delivers a branch's events to that branch's subscribers", () => {
    const feed = new OrderLiveFeed();
    const branchA: OrderLiveEvent[] = [];
    feed.forBranch("a").subscribe((e) => branchA.push(e));
    feed.publish({ change: "registered", orderId: "o1", branchId: "b" });
    feed.publish({ change: "registered", orderId: "o2", branchId: "a" });
    expect(branchA.map((e) => e.orderId)).toEqual(["o2"]);
  });
});
