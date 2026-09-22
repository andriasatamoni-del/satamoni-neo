import { BranchStockThreshold } from "../../../src/contexts/inventory/domain/branch-stock-threshold.aggregate";
import { NegativeStockThresholdError } from "../../../src/contexts/inventory/domain/errors";

describe("BranchStockThreshold aggregate", () => {
  it("default بيرجّع حدود فاضية (كله null)", () => {
    const threshold = BranchStockThreshold.default("branch-1", "item-1");
    expect(threshold.reorderPoint).toBeNull();
    expect(threshold.minStock).toBeNull();
    expect(threshold.maxStock).toBeNull();
  });

  it("update بيحدّث الحقول المبعوتة بس وبيسجّل updatedBy", () => {
    const threshold = BranchStockThreshold.default("branch-1", "item-1");
    threshold.update({ reorderPoint: 10, updatedBy: "user-1" });
    expect(threshold.reorderPoint).toBe(10);
    expect(threshold.minStock).toBeNull();
    expect(threshold.updatedBy).toBe("user-1");
  });

  it("update بيرفض قيمة سالبة", () => {
    const threshold = BranchStockThreshold.default("branch-1", "item-1");
    expect(() => threshold.update({ reorderPoint: -1, updatedBy: "user-1" })).toThrow(NegativeStockThresholdError);
  });
});
