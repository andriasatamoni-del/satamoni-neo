import { AccountingPeriod } from "../../../src/contexts/accounting/domain/accounting-period.aggregate";
import { AccountingPeriodAlreadyClosedError } from "../../../src/contexts/accounting/domain/errors";

describe("AccountingPeriod aggregate", () => {
  it("openFor بيبدأ الشهر بحالة OPEN", () => {
    const period = AccountingPeriod.openFor(2026, 3);
    expect(period.year).toBe(2026);
    expect(period.month).toBe(3);
    expect(period.status).toBe("OPEN");
    expect(period.closedAt).toBeNull();
  });

  it("close بيقفل الشهر ويسجّل مين قفله وإمتى", () => {
    const period = AccountingPeriod.openFor(2026, 3);
    period.close("user-1");
    expect(period.status).toBe("CLOSED");
    expect(period.closedBy).toBe("user-1");
    expect(period.closedAt).not.toBeNull();
  });

  it("close بيرفض قفل شهر مقفول بالفعل", () => {
    const period = AccountingPeriod.openFor(2026, 3);
    period.close("user-1");
    expect(() => period.close("user-2")).toThrow(AccountingPeriodAlreadyClosedError);
  });
});
