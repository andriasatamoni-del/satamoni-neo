import { GoodsReceipt } from "../../../src/contexts/procurement/domain/goods-receipt.aggregate";
import { EmptyGoodsReceiptError, GoodsReceiptAlreadyConfirmedError } from "../../../src/contexts/procurement/domain/errors";

describe("GoodsReceipt aggregate", () => {
  it("بيسجّل إذن استلام صحيح بحالة DRAFT، PO-less (بدون purchaseOrderId)", () => {
    const receipt = GoodsReceipt.register({
      branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 10, unitCost: 5 }],
    });
    expect(receipt.status).toBe("DRAFT");
    expect(receipt.purchaseOrderId).toBeNull();
  });

  it("بيقبل إذن استلام مربوط بأمر شراء رسمي", () => {
    const receipt = GoodsReceipt.register({
      purchaseOrderId: "po-1", supplierId: "supplier-1", branchId: "branch-1",
      lines: [{ inventoryItemId: "item-1", quantity: 10, unitCost: 5 }],
    });
    expect(receipt.purchaseOrderId).toBe("po-1");
  });

  it("بيرفض إذن استلام من غير بنود", () => {
    expect(() => GoodsReceipt.register({ branchId: "branch-1", lines: [] })).toThrow(EmptyGoodsReceiptError);
  });

  it("confirm بيغيّر الحالة ويحط confirmedAt، ومينفعش يتأكد مرتين", () => {
    const receipt = GoodsReceipt.register({
      branchId: "branch-1", lines: [{ inventoryItemId: "item-1", quantity: 1, unitCost: 1 }],
    });
    receipt.confirm();
    expect(receipt.status).toBe("CONFIRMED");
    expect(receipt.confirmedAt).not.toBeNull();
    expect(() => receipt.confirm()).toThrow(GoodsReceiptAlreadyConfirmedError);
  });
});
