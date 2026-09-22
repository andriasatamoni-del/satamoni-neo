import { classifyStockLevel } from "../../../src/contexts/inventory/domain/stock-level";

describe("classifyStockLevel", () => {
  it("رصيد صفر أو أقل = OUT بغض النظر عن حد إعادة الطلب", () => {
    expect(classifyStockLevel(0, 10)).toBe("OUT");
    expect(classifyStockLevel(-2, null)).toBe("OUT");
  });

  it("رصيد موجب ووصل لحد إعادة الطلب أو تحته = NEEDS_REORDER", () => {
    expect(classifyStockLevel(5, 10)).toBe("NEEDS_REORDER");
    expect(classifyStockLevel(10, 10)).toBe("NEEDS_REORDER");
  });

  it("رصيد موجب فوق حد إعادة الطلب = NORMAL", () => {
    expect(classifyStockLevel(15, 10)).toBe("NORMAL");
  });

  it("مفيش حد إعادة طلب مضبوط = NORMAL طول ما الرصيد موجب", () => {
    expect(classifyStockLevel(1, null)).toBe("NORMAL");
  });
});
