import { CashDrawerEntry } from "../../../src/contexts/shifts/domain/cash-drawer-entry.aggregate";
import { CashDrawerEntryLabelRequiredError, InvalidCashDrawerEntryAmountError } from "../../../src/contexts/shifts/domain/errors";

function baseInput(overrides: Partial<Parameters<typeof CashDrawerEntry.register>[0]> = {}) {
  return {
    shiftId: "shift-1",
    branchId: "b1",
    userId: "u1",
    entryType: "EXPENSE",
    amount: 50,
    label: "صيانة ماكينة",
    createdBy: "u1",
    ...overrides,
  };
}

describe("CashDrawerEntry aggregate", () => {
  it("register بينشئ بند مصروف صحيح", () => {
    const entry = CashDrawerEntry.register(baseInput());
    expect(entry.entryType).toBe("EXPENSE");
    expect(entry.amount).toBe(50);
    expect(entry.label).toBe("صيانة ماكينة");
  });

  it("register بينشئ بند مشترى صحيح", () => {
    const entry = CashDrawerEntry.register(baseInput({ entryType: "PURCHASE", label: "خضار من السوق", amount: 120 }));
    expect(entry.entryType).toBe("PURCHASE");
    expect(entry.amount).toBe(120);
  });

  it("register برفض نوع بند غير معروف", () => {
    expect(() => CashDrawerEntry.register(baseInput({ entryType: "REFUND" }))).toThrow(InvalidCashDrawerEntryAmountError);
  });

  it("register برفض مبلغ صفر أو سالب", () => {
    expect(() => CashDrawerEntry.register(baseInput({ amount: 0 }))).toThrow(InvalidCashDrawerEntryAmountError);
    expect(() => CashDrawerEntry.register(baseInput({ amount: -10 }))).toThrow(InvalidCashDrawerEntryAmountError);
  });

  it("register برفض بيان فاضي", () => {
    expect(() => CashDrawerEntry.register(baseInput({ label: "  " }))).toThrow(CashDrawerEntryLabelRequiredError);
  });
});
