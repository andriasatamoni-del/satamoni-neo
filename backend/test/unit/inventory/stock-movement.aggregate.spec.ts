import { StockMovement } from "../../../src/contexts/inventory/domain/stock-movement.aggregate";
import { UnknownMovementTypeError, ZeroQuantityMovementError } from "../../../src/contexts/inventory/domain/errors";

describe("StockMovement aggregate", () => {
  it("بيسجّل حركة صحيحة", () => {
    const movement = StockMovement.register({
      inventoryItemId: "item-1", branchId: "branch-1", movementType: "RECEIPT", quantityDelta: 10,
    });
    expect(movement.movementType).toBe("RECEIPT");
    expect(movement.quantityDelta).toBe(10);
  });

  it("بيرفض نوع حركة مش معروف", () => {
    expect(() =>
      StockMovement.register({ inventoryItemId: "item-1", branchId: "branch-1", movementType: "ghost", quantityDelta: 1 })
    ).toThrow(UnknownMovementTypeError);
  });

  it("بيرفض كمية صفر", () => {
    expect(() =>
      StockMovement.register({ inventoryItemId: "item-1", branchId: "branch-1", movementType: "ADJUSTMENT", quantityDelta: 0 })
    ).toThrow(ZeroQuantityMovementError);
  });

  it("بيقبل كمية سالبة (استهلاك)", () => {
    const movement = StockMovement.register({
      inventoryItemId: "item-1", branchId: "branch-1", movementType: "CONSUMPTION", quantityDelta: -3,
    });
    expect(movement.quantityDelta).toBe(-3);
  });
});
