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
});
