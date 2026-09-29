import {
  computeRequisitionLine,
  coverageWindow,
  lookbackDatesForWindow,
  pastOccurrencesOfWeekday,
  MAX_COVERAGE_DAYS,
  type RequisitionItemInput,
} from "../../../src/contexts/inventory/domain/requisition-suggestion";

function item(overrides: Partial<RequisitionItemInput> = {}): RequisitionItemInput {
  return {
    inventoryItemId: "item-1",
    name: "دقيق",
    unit: "كيلو",
    currentStock: 0,
    minStock: null,
    maxStock: null,
    consumptionByDate: new Map(),
    pendingPipelineQuantity: 0,
    inTransitQuantity: 0,
    ...overrides,
  };
}

describe("requisition suggestion", () => {
  it("pastOccurrencesOfWeekday بيرجّع نفس يوم الأسبوع في الأسابيع اللي فاتت", () => {
    // 2026-10-01 خميس
    expect(pastOccurrencesOfWeekday("2026-10-01", 3)).toEqual(["2026-09-24", "2026-09-17", "2026-09-10"]);
  });

  it("coverageWindow: يوم واحد من غير تاريخ تزويد، ونطاق [target, next) لو موجود", () => {
    expect(coverageWindow("2026-10-01", null)).toEqual(["2026-10-01"]);
    expect(coverageWindow("2026-10-01", "2026-10-01")).toEqual(["2026-10-01"]);
    expect(coverageWindow("2026-10-01", "2026-10-04")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("coverageWindow متسقّفة بحد أقصى للأيام", () => {
    expect(coverageWindow("2026-10-01", "2027-10-01")).toHaveLength(MAX_COVERAGE_DAYS);
  });

  it("lookbackDatesForWindow بيجمع تواريخ كل أيام النافذة من غير تكرار", () => {
    const dates = lookbackDatesForWindow(["2026-10-01", "2026-10-02"], 2);
    expect(dates).toEqual(["2026-09-17", "2026-09-18", "2026-09-24", "2026-09-25"]);
  });

  it("متوسط استهلاك نفس يوم الأسبوع - الأيام اللي مفيهاش استهلاك بتتحسب صفر", () => {
    const consumption = new Map([["2026-09-24", 10], ["2026-09-17", 6]]);
    const line = computeRequisitionLine(item({ consumptionByDate: consumption }), ["2026-10-01"], 4);
    expect(line.avgWeekdayConsumption).toBe(4); // (10 + 6 + 0 + 0) / 4
    expect(line.expectedConsumption).toBe(4);
    expect(line.suggestedQuantity).toBe(4);
  });

  it("الحد الأدنى بيتضاف للهدف، والحد الأقصى بيسقّفه", () => {
    const consumption = new Map([["2026-09-24", 20]]);
    const withMin = computeRequisitionLine(item({ consumptionByDate: consumption, minStock: 5 }), ["2026-10-01"], 1);
    expect(withMin.target).toBe(25);
    expect(withMin.suggestedQuantity).toBe(25);

    const capped = computeRequisitionLine(item({ consumptionByDate: consumption, minStock: 5, maxStock: 12 }), ["2026-10-01"], 1);
    expect(capped.target).toBe(12);
    expect(capped.suggestedQuantity).toBe(12);
  });

  it("الرصيد الحالي والكميات المطلوبة واللي في الطريق بتتخصم - والاقتراح عمره ما يبقى سالب", () => {
    const consumption = new Map([["2026-09-24", 20]]);
    const line = computeRequisitionLine(
      item({ consumptionByDate: consumption, currentStock: 5, pendingPipelineQuantity: 3, inTransitQuantity: 4 }),
      ["2026-10-01"],
      1
    );
    expect(line.suggestedQuantity).toBe(8); // 20 - (5 + 3 + 4)

    const overstocked = computeRequisitionLine(item({ consumptionByDate: consumption, currentStock: 50 }), ["2026-10-01"], 1);
    expect(overstocked.suggestedQuantity).toBe(0);
  });

  it("نافذة متعددة الأيام: كل يوم بمتوسط يوم أسبوعه هو", () => {
    // الخميس 2026-10-01 استهلاكه التاريخي 10، الجمعة 2026-10-02 استهلاكها 30
    const consumption = new Map([["2026-09-24", 10], ["2026-09-25", 30]]);
    const line = computeRequisitionLine(item({ consumptionByDate: consumption }), ["2026-10-01", "2026-10-02"], 1);
    expect(line.avgWeekdayConsumption).toBe(10);
    expect(line.expectedConsumption).toBe(40);
    expect(line.coverageDays).toBe(2);
    expect(line.suggestedQuantity).toBe(40);
  });
});
