import { computeAccountBalance, isCreditNormalAccount } from "../../../src/contexts/accounting/domain/accounting-reports";

describe("accounting-reports (قواعد الجانب الطبيعي للحساب)", () => {
  it("الالتزامات/حقوق الملكية/الإيرادات جانبها الطبيعي دائن", () => {
    expect(isCreditNormalAccount("LIABILITY")).toBe(true);
    expect(isCreditNormalAccount("EQUITY")).toBe(true);
    expect(isCreditNormalAccount("REVENUE")).toBe(true);
  });

  it("الأصول/تكلفة المبيعات/المصروفات جانبها الطبيعي مدين", () => {
    expect(isCreditNormalAccount("ASSET")).toBe(false);
    expect(isCreditNormalAccount("COGS")).toBe(false);
    expect(isCreditNormalAccount("EXPENSE")).toBe(false);
  });

  it("حساب مدين-طبيعي: الرصيد = مدين - دائن", () => {
    expect(computeAccountBalance("ASSET", 500, 200)).toBe(300);
    expect(computeAccountBalance("EXPENSE", 100, 100)).toBe(0);
  });

  it("حساب دائن-طبيعي: الرصيد = دائن - مدين", () => {
    expect(computeAccountBalance("REVENUE", 50, 800)).toBe(750);
    expect(computeAccountBalance("LIABILITY", 300, 300)).toBe(0);
  });
});
