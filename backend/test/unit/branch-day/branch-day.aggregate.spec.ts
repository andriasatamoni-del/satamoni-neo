import { BranchDay } from "../../../src/contexts/branch-day/domain/branch-day.aggregate";

describe("BranchDay aggregate", () => {
  it("register بيسجّل يوم مقفول بكل القيم المبعوتة", () => {
    const day = BranchDay.register({
      branchId: "branch-1",
      businessDate: "2026-01-01",
      closedBy: "user-1",
      totalSales: 1500,
      orderCount: 12,
      cashVarianceTotal: -5,
    });
    expect(day.branchId).toBe("branch-1");
    expect(day.businessDate).toBe("2026-01-01");
    expect(day.closedBy).toBe("user-1");
    expect(day.totalSales).toBe(1500);
    expect(day.orderCount).toBe(12);
    expect(day.cashVarianceTotal).toBe(-5);
    expect(day.managerNotes).toBeNull();
    expect(day.closedAt).toBeInstanceOf(Date);
  });

  it("register بياخد managerNotes لو موجودة", () => {
    const day = BranchDay.register({
      branchId: "branch-1",
      businessDate: "2026-01-01",
      closedBy: "user-1",
      totalSales: 0,
      orderCount: 0,
      cashVarianceTotal: 0,
      managerNotes: "ملاحظة",
    });
    expect(day.managerNotes).toBe("ملاحظة");
  });

  it("reconstitute بيرجّع نفس القيم من غير تعديل", () => {
    const props = {
      branchId: "branch-1",
      businessDate: "2026-01-01",
      closedBy: "user-1",
      closedAt: new Date("2026-01-01T20:00:00Z"),
      totalSales: 100,
      orderCount: 2,
      cashVarianceTotal: 0,
      managerNotes: null,
    };
    const day = BranchDay.reconstitute("day-1", props);
    expect(day.id).toBe("day-1");
    expect(day.totalSales).toBe(100);
    expect(day.closedAt).toEqual(props.closedAt);
  });
});
