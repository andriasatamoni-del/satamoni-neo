import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";
import {
  InvalidUnitError,
  UnknownItemTypeError,
  UnknownNegativeStockPolicyError,
} from "../../../src/contexts/inventory/domain/errors";

describe("InventoryItem aggregate", () => {
  it("بيسجّل صنف صحيح بقيم افتراضية سليمة", () => {
    const item = InventoryItem.register({ name: "دقيق", unit: "كيلو" });
    expect(item.itemType).toBe("raw");
    expect(item.negativeStockPolicy).toBe("STRICT");
    expect(item.unitCost).toBeNull();
  });

  it("بيرفض وحدة فاضية", () => {
    expect(() => InventoryItem.register({ name: "دقيق", unit: "  " })).toThrow(InvalidUnitError);
  });

  it("بيرفض نوع صنف مش معروف", () => {
    expect(() => InventoryItem.register({ name: "دقيق", unit: "كيلو", itemType: "ghost" })).toThrow(
      UnknownItemTypeError
    );
  });

  it("بيرفض سياسة رصيد سالب مش معروفة", () => {
    expect(() =>
      InventoryItem.register({ name: "دقيق", unit: "كيلو", negativeStockPolicy: "ghost" })
    ).toThrow(UnknownNegativeStockPolicyError);
  });

  it("changeNegativeStockPolicy بيرفض قيمة مش معروفة ومايغيّرش الحالة الحالية", () => {
    const item = InventoryItem.register({ name: "دقيق", unit: "كيلو" });
    expect(() => item.changeNegativeStockPolicy("ghost")).toThrow(UnknownNegativeStockPolicyError);
    expect(item.negativeStockPolicy).toBe("STRICT");
  });

  it("changeNegativeStockPolicy بيغيّر السياسة لو صحيحة", () => {
    const item = InventoryItem.register({ name: "دقيق", unit: "كيلو" });
    item.changeNegativeStockPolicy("ALLOW_WITH_APPROVAL");
    expect(item.negativeStockPolicy).toBe("ALLOW_WITH_APPROVAL");
  });
});
