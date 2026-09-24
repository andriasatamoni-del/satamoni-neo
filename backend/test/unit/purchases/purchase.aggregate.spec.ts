import { Purchase } from "../../../src/contexts/purchases/domain/purchase.aggregate";
import { PurchaseMissingAmountOrItemsError, PurchaseNotPendingError, InvalidPurchaseLineError } from "../../../src/contexts/purchases/domain/errors";

function registerAmountOnly(overrides: Partial<Parameters<typeof Purchase.register>[0]> = {}) {
  return Purchase.register({
    branchId: "branch-1",
    businessDate: new Date("2026-01-01"),
    amount: 100,
    initialStatus: "PENDING",
    ...overrides,
  });
}

function registerWithItems(overrides: Partial<Parameters<typeof Purchase.register>[0]> = {}) {
  return Purchase.register({
    branchId: "branch-1",
    businessDate: new Date("2026-01-01"),
    items: [{ inventoryItemId: "item-1", quantity: 10, unit: "kg", unitPrice: 5 }],
    initialStatus: "PENDING",
    ...overrides,
  });
}

describe("Purchase aggregate", () => {
  it("register بيرفض مشترى من غير مبلغ ومن غير بنود", () => {
    expect(() => Purchase.register({ branchId: "branch-1", businessDate: new Date(), initialStatus: "PENDING" })).toThrow(
      PurchaseMissingAmountOrItemsError
    );
  });

  it("register بمبلغ حر - بيسجّل من غير بنود، والمبلغ هو amount المبعوت", () => {
    const purchase = registerAmountOnly({ amount: 250 });
    expect(purchase.amount).toBe(250);
    expect(purchase.lines).toHaveLength(0);
    expect(purchase.postedToInventory).toBe(false);
  });

  it("register ببنود - بيحسب lineTotal وamount الإجمالي من الكمية*السعر", () => {
    const purchase = Purchase.register({
      branchId: "branch-1",
      businessDate: new Date("2026-01-01"),
      items: [
        { inventoryItemId: "item-1", quantity: 10, unit: "kg", unitPrice: 5 },
        { inventoryItemId: "item-2", quantity: 3, unit: "kg", unitPrice: 2.5 },
      ],
      initialStatus: "PENDING",
    });
    expect(purchase.lines).toHaveLength(2);
    expect(purchase.lines[0].lineTotal).toBe(50);
    expect(purchase.lines[1].lineTotal).toBe(7.5);
    expect(purchase.amount).toBe(57.5);
  });

  it("register ببند غلط (كمية صفر أو سعر سالب) بيرمي InvalidPurchaseLineError", () => {
    expect(() =>
      Purchase.register({
        branchId: "branch-1",
        businessDate: new Date(),
        items: [{ inventoryItemId: "item-1", quantity: 0, unit: "kg", unitPrice: 5 }],
        initialStatus: "PENDING",
      })
    ).toThrow(InvalidPurchaseLineError);
    expect(() =>
      Purchase.register({
        branchId: "branch-1",
        businessDate: new Date(),
        items: [{ inventoryItemId: "item-1", quantity: 1, unit: "kg", unitPrice: -1 }],
        initialStatus: "PENDING",
      })
    ).toThrow(InvalidPurchaseLineError);
  });

  it("register بـinitialStatus=CONFIRMED بيسجّل الحالة دي مباشرة", () => {
    const purchase = registerAmountOnly({ initialStatus: "CONFIRMED" });
    expect(purchase.status).toBe("CONFIRMED");
  });

  it("edit بيشتغل PENDING بس، وبيعيد حساب البنود لو اتبعتت", () => {
    const purchase = registerWithItems();
    purchase.edit({ items: [{ inventoryItemId: "item-1", quantity: 4, unit: "kg", unitPrice: 5 }], notes: "ملاحظة" });
    expect(purchase.amount).toBe(20);
    expect(purchase.notes).toBe("ملاحظة");

    purchase.confirm({ reviewedBy: "u1" });
    expect(() => purchase.edit({ notes: "تاني" })).toThrow(PurchaseNotPendingError);
  });

  it("confirm بيحتاج PENDING، وبيسجّل reviewedBy وreviewedAt", () => {
    const purchase = registerAmountOnly();
    purchase.confirm({ reviewedBy: "u1" });
    expect(purchase.status).toBe("CONFIRMED");
    expect(purchase.reviewedBy).toBe("u1");
    expect(purchase.reviewedAt).not.toBeNull();
    expect(() => purchase.confirm({ reviewedBy: "u2" })).toThrow(PurchaseNotPendingError);
  });

  it("reject بيحتاج PENDING، وبيسجّل السبب", () => {
    const purchase = registerAmountOnly();
    purchase.reject({ reviewedBy: "u1", reason: "مش صحيح" });
    expect(purchase.status).toBe("REJECTED");
    expect(purchase.rejectionReason).toBe("مش صحيح");
    expect(() => purchase.reject({ reviewedBy: "u1" })).toThrow(PurchaseNotPendingError);
  });

  it("markPostedToInventory بيسجّل العلم postedToInventory", () => {
    const purchase = registerWithItems();
    expect(purchase.postedToInventory).toBe(false);
    purchase.markPostedToInventory();
    expect(purchase.postedToInventory).toBe(true);
  });
});
