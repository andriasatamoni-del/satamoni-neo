import { Order } from "../../../src/contexts/orders/domain/order.aggregate";
import {
  EmptyOrderError,
  InvalidKitchenStatusTransitionError,
  OrderAlreadyFinalizedError,
  OrderCancelledError,
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

  it("بيحفظ clientRequestId لو اتبعت (وضع الكاشير الأوفلاين) وبيفضل null لو معندوش", () => {
    const withId = Order.register({
      branchId: "branch-1", orderType: "takeaway",
      items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      clientRequestId: "11111111-1111-4111-a111-111111111111",
    });
    expect(withId.clientRequestId).toBe("11111111-1111-4111-a111-111111111111");

    const withoutId = Order.register({
      branchId: "branch-1", orderType: "takeaway",
      items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
    });
    expect(withoutId.clientRequestId).toBeNull();
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

  describe("advanceKitchenStatus", () => {
    function newOrder() {
      return Order.register({
        branchId: "branch-1", orderType: "takeaway",
        items: [{ menuItemId: "item-1", variantId: "variant-1", quantity: 1, unitPrice: 10 }],
      });
    }

    it("بيرفض حالة مطبخ مش معروفة", () => {
      expect(() => newOrder().advanceKitchenStatus("ghost")).toThrow(UnknownKitchenStatusError);
    });

    it("بيتقدّم خطوة بخطوة (NEW->ACCEPTED->PREPARING->READY) ويسجّل توقيتات القبول والجاهزية", () => {
      const order = newOrder();
      order.advanceKitchenStatus("ACCEPTED");
      expect(order.kitchenStatus).toBe("ACCEPTED");
      expect(order.kitchenAcceptedAt).not.toBeNull();

      order.advanceKitchenStatus("PREPARING");
      expect(order.kitchenStatus).toBe("PREPARING");

      order.advanceKitchenStatus("READY");
      expect(order.kitchenStatus).toBe("READY");
      expect(order.kitchenReadyAt).not.toBeNull();
    });

    it("بيرفض تخطّي خطوة (NEW مباشرة لـPREPARING)", () => {
      expect(() => newOrder().advanceKitchenStatus("PREPARING")).toThrow(InvalidKitchenStatusTransitionError);
    });

    it("بيرفض الرجوع لورا", () => {
      const order = newOrder();
      order.advanceKitchenStatus("ACCEPTED");
      expect(() => order.advanceKitchenStatus("NEW")).toThrow(InvalidKitchenStatusTransitionError);
    });

    it("مش مرتبطة بـstatus - بتتقدّم حتى لو الطلب completed", () => {
      const order = newOrder();
      order.setStatus("completed");
      order.advanceKitchenStatus("ACCEPTED");
      expect(order.kitchenStatus).toBe("ACCEPTED");
    });

    it("بيرفض أي تقدّم لو الطلب اتلغى", () => {
      const order = newOrder();
      order.setStatus("cancelled");
      expect(() => order.advanceKitchenStatus("ACCEPTED")).toThrow(OrderCancelledError);
    });
  });
});
