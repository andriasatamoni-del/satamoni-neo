import { Expense } from "../../../src/contexts/expenses/domain/expense.aggregate";
import {
  InvalidExpenseAmountError,
  ExpenseNotDraftError,
  ExpenseNotSubmittedError,
  ExpenseNotCancellableError,
  ExpenseAlreadyCancelledError,
} from "../../../src/contexts/expenses/domain/errors";

function register(overrides: Partial<Parameters<typeof Expense.register>[0]> = {}) {
  return Expense.register({
    branchId: "branch-1",
    businessDate: new Date("2026-01-01"),
    categoryId: "cat-1",
    amount: 100,
    ...overrides,
  });
}

describe("Expense aggregate", () => {
  it("register بيرفض مبلغ صفر أو سالب", () => {
    expect(() => register({ amount: 0 })).toThrow(InvalidExpenseAmountError);
    expect(() => register({ amount: -5 })).toThrow(InvalidExpenseAmountError);
  });

  it("register بيسجّل SUBMITTED افتراضيًا لو مفيش initialStatus", () => {
    const expense = register();
    expect(expense.status).toBe("SUBMITTED");
  });

  it("register بيسجّل DRAFT لو اتحدد صراحة", () => {
    const expense = register({ initialStatus: "DRAFT" });
    expect(expense.status).toBe("DRAFT");
  });

  it("submit بيحوّل DRAFT لـSUBMITTED بس", () => {
    const expense = register({ initialStatus: "DRAFT" });
    expense.submit();
    expect(expense.status).toBe("SUBMITTED");
    expect(() => expense.submit()).toThrow(ExpenseNotDraftError);
  });

  it("post بيحتاج SUBMITTED، وبيسجّل journalEntryId ومين رحّله", () => {
    const expense = register();
    expense.post({ journalEntryId: "je-1", postedBy: "u1" });
    expect(expense.status).toBe("POSTED");
    expect(expense.journalEntryId).toBe("je-1");
    expect(expense.postedBy).toBe("u1");
    expect(expense.postedAt).not.toBeNull();
  });

  it("مايصحش ترحّل مصروف DRAFT من غير submit الأول", () => {
    const expense = register({ initialStatus: "DRAFT" });
    expect(() => expense.post({ journalEntryId: "je-1", postedBy: "u1" })).toThrow(ExpenseNotSubmittedError);
  });

  it("edit بيحتاج SUBMITTED بس", () => {
    const draft = register({ initialStatus: "DRAFT" });
    expect(() => draft.edit({ amount: 50 })).toThrow(ExpenseNotSubmittedError);

    const submitted = register();
    submitted.edit({ amount: 200 });
    expect(submitted.amount).toBe(200);
    expect(() => submitted.edit({ amount: -1 })).toThrow(InvalidExpenseAmountError);
  });

  it("cancel بيشتغل من DRAFT/SUBMITTED بس، ومش من POSTED", () => {
    const submitted = register();
    submitted.cancel({ cancelledBy: "u1", reason: "غلط" });
    expect(submitted.status).toBe("CANCELLED");
    expect(() => submitted.cancel({ cancelledBy: "u1", reason: "تاني" })).toThrow(ExpenseAlreadyCancelledError);

    const posted = register();
    posted.post({ journalEntryId: "je-1", postedBy: "u1" });
    expect(() => posted.cancel({ cancelledBy: "u1", reason: "سبب" })).toThrow(ExpenseNotCancellableError);
  });
});
