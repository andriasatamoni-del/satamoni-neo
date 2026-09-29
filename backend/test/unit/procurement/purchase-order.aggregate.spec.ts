import { PurchaseOrder } from "../../../src/contexts/procurement/domain/purchase-order.aggregate";
import {
  EmptyPurchaseOrderError,
  PurchaseOrderNotCancellableError,
  PurchaseOrderNotEditableError,
} from "../../../src/contexts/procurement/domain/errors";

describe("PurchaseOrder aggregate", () => {
  it("بيسجّل أمر شراء صحيح بحالة DRAFT", () => {
    const order = PurchaseOrder.register({
      supplierId: "supplier-1",
      branchId: "branch-1",
      lines: [{ inventoryItemId: "item-1", quantity: 10, unitPrice: 5 }],
    });
    expect(order.status).toBe("DRAFT");
    expect(order.lines).toHaveLength(1);
  });

  it("بيرفض أمر شراء من غير بنود", () => {
    expect(() =>
      PurchaseOrder.register({ supplierId: "supplier-1", branchId: "branch-1", lines: [] })
    ).toThrow(EmptyPurchaseOrderError);
  });

  it("markSent بيرفض لو الحالة مش DRAFT", () => {
    const order = PurchaseOrder.register({
      supplierId: "supplier-1", branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitPrice: 1 }],
    });
    order.markSent();
    expect(() => order.markSent()).toThrow(PurchaseOrderNotEditableError);
  });

  it("cancel بيغيّر الحالة لـCANCELLED من DRAFT أو SENT", () => {
    const order = PurchaseOrder.register({
      supplierId: "supplier-1", branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitPrice: 1 }],
    });
    order.cancel();
    expect(order.status).toBe("CANCELLED");
  });

  it("cancel بيرفض لو الحالة RECEIVED أو CANCELLED بالفعل", () => {
    const received = PurchaseOrder.register({
      supplierId: "supplier-1", branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitPrice: 1 }],
    });
    received.markReceived();
    expect(() => received.cancel()).toThrow(PurchaseOrderNotCancellableError);

    const cancelled = PurchaseOrder.register({
      supplierId: "supplier-1", branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitPrice: 1 }],
    });
    cancelled.cancel();
    expect(() => cancelled.cancel()).toThrow(PurchaseOrderNotCancellableError);
  });

  describe("applyReceivedQuantities", () => {
    function sentOrder(): PurchaseOrder {
      const order = PurchaseOrder.register({
        supplierId: "supplier-1",
        branchId: "branch-1",
        lines: [
          { inventoryItemId: "item-1", quantity: 10, unitPrice: 5 },
          { inventoryItemId: "item-2", quantity: 4, unitPrice: 2 },
        ],
      });
      order.markSent();
      return order;
    }

    it("استلام جزئي لصنف واحد -> PARTIALLY_RECEIVED", () => {
      const order = sentOrder();
      order.applyReceivedQuantities(new Map([["item-1", 3]]));
      expect(order.status).toBe("PARTIALLY_RECEIVED");
    });

    it("استلام كل الكميات -> RECEIVED", () => {
      const order = sentOrder();
      order.applyReceivedQuantities(new Map([["item-1", 10], ["item-2", 4]]));
      expect(order.status).toBe("RECEIVED");
    });

    it("استلام زيادة عن المطلوب بيعتبر استلام كامل", () => {
      const order = sentOrder();
      order.applyReceivedQuantities(new Map([["item-1", 12], ["item-2", 4]]));
      expect(order.status).toBe("RECEIVED");
    });

    it("من غير أي كمية مستلمة الحالة بتفضل SENT", () => {
      const order = sentOrder();
      order.applyReceivedQuantities(new Map());
      expect(order.status).toBe("SENT");
    });

    it("مش بيأثر على أمر DRAFT أو CANCELLED", () => {
      const draft = PurchaseOrder.register({
        supplierId: "supplier-1", branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitPrice: 1 }],
      });
      draft.applyReceivedQuantities(new Map([["item-1", 1]]));
      expect(draft.status).toBe("DRAFT");

      const cancelled = sentOrder();
      cancelled.cancel();
      cancelled.applyReceivedQuantities(new Map([["item-1", 10], ["item-2", 4]]));
      expect(cancelled.status).toBe("CANCELLED");
    });

    it("أمر مستلم جزئيًا مينفعش يتلغي", () => {
      const order = sentOrder();
      order.applyReceivedQuantities(new Map([["item-1", 3]]));
      expect(() => order.cancel()).toThrow(PurchaseOrderNotCancellableError);
    });
  });
});
