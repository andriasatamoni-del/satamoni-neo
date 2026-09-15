import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import {
  EmptyOrderError,
  OrderAlreadyFinalizedError,
  UnknownKitchenStatusError,
  UnknownOrderStatusError,
  UnknownOrderTypeError,
} from "../../../src/contexts/orders/domain/errors";

describe("Order aggregate", () => {
  it("بيسجّل طلب صحيح ويحسب subtotal/total صح", () => {
    const order = Order.register({
      branchId: "branch-1",
      orderType: "takeaway",
      items: [
        { menuItemId: "item-1", variantId: "variant-1", quantity: 2, unitPrice: 50 },
        { menuItemId: "item-2", variantId: "variant-2", quantity: 1, unitPrice: 30 },
      ],
      discount: 10,
    });
    expect(order.subtotal).toBe(130);
    expect(order.total).toBe(120);
    expect(order.status).toBe("preparing");
    expect(order.kitchenStatus).toBe("NEW");
  });

  it("بيرفض طلب من غير أصناف", () => {
    expect(() => Order.register({ branchId: "branch-1", orderType: "takeaway", items: [] })).toThrow(EmptyOrderError);
  });

  it("بيرفض نوع طلب مش معروف", () => {
    expect(() =>
      Order.register({
        branchId: "branch-1", orderType: "ghost",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      })
    ).toThrow(UnknownOrderTypeError);
  });

  describe("setStatus", () => {
    it("بيرفض حالة مش معروفة", () => {
      const order = Order.register({
        branchId: "branch-1", orderType: "takeaway",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      });
      expect(() => order.setStatus("ghost")).toThrow(UnknownOrderStatusError);
    });

    it("بيرفض أي تعديل حالة بعد ما الطلب يتقفل (completed/cancelled)", () => {
      const order = Order.register({
        branchId: "branch-1", orderType: "takeaway",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      });
      order.setStatus("completed");
      expect(() => order.setStatus("cancelled")).toThrow(OrderAlreadyFinalizedError);
    });
  });

  describe("setKitchenStatus", () => {
    it("بيرفض حالة مطبخ مش معروفة", () => {
      const order = Order.register({
        branchId: "branch-1", orderType: "takeaway",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      });
      expect(() => order.setKitchenStatus("ghost")).toThrow(UnknownKitchenStatusError);
    });

    it("مش مرتبطة بـstatus - بتتغيّر حتى لو الطلب completed", () => {
      const order = Order.register({
        branchId: "branch-1", orderType: "takeaway",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      });
      order.setStatus("completed");
      order.setKitchenStatus("READY");
      expect(order.kitchenStatus).toBe("READY");
    });
  });
});
