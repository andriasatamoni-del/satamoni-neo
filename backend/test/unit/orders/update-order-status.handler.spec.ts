import { UpdateOrderStatusHandler } from "../../../src/contexts/orders/application/commands/update-order-status.handler";
import { CancelledStatusRequiresDedicatedEndpointError, OrderNotFoundError } from "../../../src/contexts/orders/domain/errors";
import type { OrderRepositoryPort } from "../../../src/contexts/orders/domain/ports/order-repository.port";
import type { EventBusService } from "../../../src/shared/events/event-bus.service";

function fakeBus() {
  return { publish: jest.fn() } as unknown as EventBusService & { publish: jest.Mock };
}

describe("UpdateOrderStatusHandler", () => {
  it("بيرفض status='cancelled' من غير ما يقرأ الطلب أصلًا - لازم /orders/:id/cancel", async () => {
    const orders = { findById: jest.fn(), save: jest.fn() } as unknown as OrderRepositoryPort;
    const handler = new UpdateOrderStatusHandler(orders, fakeBus());

    await expect(handler.execute({ orderId: "any-id", status: "cancelled" })).rejects.toThrow(
      CancelledStatusRequiresDedicatedEndpointError
    );
    expect(orders.findById).not.toHaveBeenCalled();
  });

  it("طلب مش موجود - بيرمي OrderNotFoundError لأي status تاني", async () => {
    const orders = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() } as unknown as OrderRepositoryPort;
    const handler = new UpdateOrderStatusHandler(orders, fakeBus());

    await expect(handler.execute({ orderId: "missing", status: "completed" })).rejects.toThrow(OrderNotFoundError);
  });

  it("بينشر OrderStatusChanged بس لو الحالة اتغيّرت فعلًا", async () => {
    let status = "preparing";
    const order = {
      id: "o1", branchId: "b1", orderType: "delivery",
      get status() { return status; },
      setStatus: (s: string) => { status = s; },
    };
    const orders = { findById: jest.fn().mockResolvedValue(order), save: jest.fn() } as unknown as OrderRepositoryPort;
    const bus = fakeBus();
    const handler = new UpdateOrderStatusHandler(orders, bus);

    await handler.execute({ orderId: "o1", status: "completed" });
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish.mock.calls[0][0]).toMatchObject({ eventName: "OrderStatusChanged", previousStatus: "preparing", status: "completed" });

    await handler.execute({ orderId: "o1", status: "completed" });
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });
});
