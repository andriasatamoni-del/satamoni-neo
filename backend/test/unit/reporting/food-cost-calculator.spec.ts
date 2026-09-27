import { computeFoodCostBucket } from "../../../src/contexts/reporting/domain/food-cost-calculator";

describe("computeFoodCostBucket", () => {
  it("بلا أي تصحيحات - الفعلي = النظري ومفيش variance", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "CONSUMPTION", quantityDelta: -2, totalCost: 40 },
      { movementType: "PRODUCTION_OUT", quantityDelta: -1, totalCost: 10 },
    ]);
    expect(bucket.theoreticalCost).toBe(50);
    expect(bucket.actualUsageCost).toBe(50);
    expect(bucket.variance).toBe(0);
    expect(bucket.variancePercent).toBe(0);
  });

  it("ADJUSTMENT سالب (هالك/عجز) - بيزوّد الفعلي فوق النظري (variance موجب)", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "CONSUMPTION", quantityDelta: -2, totalCost: 40 },
      { movementType: "ADJUSTMENT", quantityDelta: -1, totalCost: 5 },
    ]);
    expect(bucket.theoreticalCost).toBe(40);
    expect(bucket.actualUsageCost).toBe(45);
    expect(bucket.variance).toBe(5);
    expect(bucket.variancePercent).toBeCloseTo(12.5);
  });

  it("ADJUSTMENT موجب (عكس إلغاء أوردر) - بينقص الفعلي تحت النظري (variance سالب)", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "CONSUMPTION", quantityDelta: -2, totalCost: 40 },
      { movementType: "ADJUSTMENT", quantityDelta: 2, totalCost: 40 },
    ]);
    expect(bucket.theoreticalCost).toBe(40);
    expect(bucket.actualUsageCost).toBe(0);
    expect(bucket.variance).toBe(-40);
  });

  it("PRODUCTION_REVERSAL بينقص الفعلي زي ADJUSTMENT الموجب بالظبط", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "PRODUCTION_OUT", quantityDelta: -3, totalCost: 30 },
      { movementType: "PRODUCTION_REVERSAL", quantityDelta: 3, totalCost: 30 },
    ]);
    expect(bucket.actualUsageCost).toBe(0);
    expect(bucket.variance).toBe(-30);
  });

  it("RECEIPT/TRANSFER_OUT/TRANSFER_IN/RETURN_TO_SUPPLIER مستبعدة تمامًا من الحساب", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "CONSUMPTION", quantityDelta: -2, totalCost: 40 },
      { movementType: "RECEIPT", quantityDelta: 100, totalCost: 1000 },
      { movementType: "TRANSFER_OUT", quantityDelta: -5, totalCost: 50 },
      { movementType: "TRANSFER_IN", quantityDelta: 5, totalCost: 50 },
      { movementType: "RETURN_TO_SUPPLIER", quantityDelta: -3, totalCost: 30 },
    ]);
    expect(bucket.theoreticalCost).toBe(40);
    expect(bucket.actualUsageCost).toBe(40);
    expect(bucket.variance).toBe(0);
  });

  it("totalCost=null لحركة نظرية - بيتعلّم incomplete صراحة، مش بيتجاهل أو يتخمّن صفر", () => {
    const bucket = computeFoodCostBucket([
      { movementType: "CONSUMPTION", quantityDelta: -2, totalCost: null },
      { movementType: "CONSUMPTION", quantityDelta: -1, totalCost: 20 },
    ]);
    expect(bucket.theoreticalCost).toBe(20);
    expect(bucket.theoreticalIncomplete).toBe(true);
  });

  it("نظري = صفر - النسبة المئوية null (مش قسمة على صفر)", () => {
    const bucket = computeFoodCostBucket([{ movementType: "ADJUSTMENT", quantityDelta: -1, totalCost: 5 }]);
    expect(bucket.theoreticalCost).toBe(0);
    expect(bucket.variancePercent).toBeNull();
  });
});
