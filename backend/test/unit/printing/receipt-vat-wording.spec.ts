import { buildCustomerReceipt, buildDeliveryFinalReceipt, buildDeliverySummary, buildDineInBill, buildKitchenSummary, buildKitchenTicket, VAT_INCLUSIVE_NOTE } from "../../../src/contexts/printing/infrastructure/print-templates";

// Accepted Phase 3 decision: menu prices are VAT-inclusive and no order-level VAT is posted. The ONLY change allowed (Phase 3.1) is
// the customer-facing wording - no tax lines, no tax rate, no tax amount.
describe("customer receipt - VAT-inclusive wording", () => {
  const order = { orderId: "o-1", branchLabel: "فرع", orderTypeLabel: "تيك أواي", createdAt: new Date("2031-01-01T10:00:00Z"), subtotal: 100, discount: 0, total: 100 };
  const items = [{ name: "صنف", quantity: 1, unitPrice: 100, lineTotal: 100 }];

  test("every CUSTOMER-facing priced document (receipt, dine-in bill, delivery receipt) states that prices include VAT", () => {
    expect(VAT_INCLUSIVE_NOTE).toBe("الأسعار شاملة ضريبة القيمة المضافة");
    expect(buildCustomerReceipt({ order, items })).toContain(VAT_INCLUSIVE_NOTE);
    expect(buildDineInBill({ order, items })).toContain(VAT_INCLUSIVE_NOTE);
    expect(buildDeliveryFinalReceipt({ order, items })).toContain(VAT_INCLUSIVE_NOTE);
  });

  test("internal documents (kitchen ticket / summaries) do not carry the customer wording", () => {
    expect(buildKitchenTicket({ order, items, stationName: "مطبخ" })).not.toContain(VAT_INCLUSIVE_NOTE);
    expect(buildKitchenSummary({ order, items })).not.toContain(VAT_INCLUSIVE_NOTE);
    expect(buildDeliverySummary({ order, items })).not.toContain(VAT_INCLUSIVE_NOTE);
  });

  test("no VAT features were added: the receipt shows no tax amount / rate line, totals are unchanged", () => {
    const html = buildCustomerReceipt({ order, items });
    expect(html).not.toMatch(/14\s*%|ضريبة\s*:|VAT\s*\d/);
    expect((html.match(/class="grand"/g) ?? []).length).toBe(1);
  });
});
