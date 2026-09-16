import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";
import { PaymentMethodNameRequiredError, UnknownPaymentMethodKindError, UnknownSettlementChannelError } from "../../../src/contexts/payment-control/domain/errors";

describe("PaymentMethod aggregate", () => {
  it("بيسجّل طريقة دفع صحيحة", () => {
    const method = PaymentMethod.register({ name: "فيزا PC", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    expect(method.isActive).toBe(true);
    expect(method.settlementChannel).toBe("visa_pos");
  });

  it("بيرفض اسم فاضي", () => {
    expect(() => PaymentMethod.register({ name: "  ", kind: "cash" })).toThrow(PaymentMethodNameRequiredError);
  });

  it("بيرفض نوع مش معروف", () => {
    expect(() => PaymentMethod.register({ name: "كاش", kind: "ghost" })).toThrow(UnknownPaymentMethodKindError);
  });

  it("بيرفض قناة تسوية مش معروفة", () => {
    expect(() => PaymentMethod.register({ name: "كاش", kind: "cash", settlementChannel: "ghost" })).toThrow(UnknownSettlementChannelError);
  });

  it("updateDetails بيحدّث فعليًا (idempotency لسكريبت الاستيراد)", () => {
    const method = PaymentMethod.register({ name: "فيزا PC", kind: "card_or_wallet" });
    method.updateDetails({ name: "فيزا PC معدّلة", kind: "card_or_wallet", settlementChannel: "visa_pos", isActive: false });
    expect(method.name).toBe("فيزا PC معدّلة");
    expect(method.settlementChannel).toBe("visa_pos");
    expect(method.isActive).toBe(false);
  });

  it("activate/deactivate بيغيّروا isActive", () => {
    const method = PaymentMethod.register({ name: "كاش", kind: "cash" });
    method.deactivate();
    expect(method.isActive).toBe(false);
    method.activate();
    expect(method.isActive).toBe(true);
  });
});
