import { Payment } from "../../../src/contexts/payment-control/domain/payment.aggregate";

describe("Payment aggregate", () => {
  it("lock بيسجّل نسخة مجمّدة من طريقة الدفع وقت القفل", () => {
    const payment = Payment.lock({
      orderId: "order-1", branchId: "branch-1", paymentMethodId: "method-1",
      methodKind: "cash", settlementChannel: null, amount: 200,
    });
    expect(payment.amount).toBe(200);
    expect(payment.methodKind).toBe("cash");
    expect(payment.settlementChannel).toBeNull();
  });

  it("applyAdjustment بيغيّر السنابشوت (التغيير الوحيد المسموح بيه بعد القفل)", () => {
    const payment = Payment.lock({
      orderId: "order-1", branchId: "branch-1", paymentMethodId: "method-1",
      methodKind: "cash", settlementChannel: null, amount: 200,
    });
    payment.applyAdjustment({ paymentMethodId: "method-2", methodKind: "card_or_wallet", settlementChannel: "visa_pos", amount: 250 });
    expect(payment.paymentMethodId).toBe("method-2");
    expect(payment.methodKind).toBe("card_or_wallet");
    expect(payment.settlementChannel).toBe("visa_pos");
    expect(payment.amount).toBe(250);
  });
});
