import { UpdateOrderStatusHandler } from "../../../src/contexts/orders/application/commands/update-order-status.handler";
import { CancelledStatusRequiresDedicatedEndpointError, OrderNotFoundError } from "../../../src/contexts/orders/domain/errors";
import type { OrderRepositoryPort } from "../../../src/contexts/orders/domain/ports/order-repository.port";

describe("UpdateOrderStatusHandler", () => {
  it("بيرفض status='cancelled' من غير ما يقرأ الطلب أصلًا - لازم /orders/:id/cancel", async () => {
    const orders = { findById: jest.fn(), save: jest.fn() } as unknown as OrderRepositoryPort;
    const handler = new UpdateOrderStatusHandler(orders);

    await expect(handler.execute({ orderId: "any-id", status: "cancelled" })).rejects.toThrow(
      CancelledStatusRequiresDedicatedEndpointError
    );
    expect(orders.findById).not.toHaveBeenCalled();
  });

  it("طلب مش موجود - بيرمي OrderNotFoundError لأي status تاني", async () => {
    const orders = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() } as unknown as OrderRepositoryPort;
    const handler = new UpdateOrderStatusHandler(orders);

    await expect(handler.execute({ orderId: "missing", status: "completed" })).rejects.toThrow(OrderNotFoundError);
  });
});
