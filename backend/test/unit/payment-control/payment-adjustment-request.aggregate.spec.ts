import { PaymentAdjustmentRequest } from "../../../src/contexts/payment-control/domain/payment-adjustment-request.aggregate";
import { AdjustmentRequestAlreadyDecidedError } from "../../../src/contexts/payment-control/domain/errors";

describe("PaymentAdjustmentRequest aggregate", () => {
  it("بيتسجّل PENDING", () => {
    const request = PaymentAdjustmentRequest.register({
      paymentId: "payment-1", proposedPaymentMethodId: "method-2", proposedAmount: 150, amountDelta: 50,
    });
    expect(request.status).toBe("PENDING");
    expect(request.decidedAt).toBeNull();
  });

  it("approve بيحدّث الحالة والمقرّر", () => {
    const request = PaymentAdjustmentRequest.register({
      paymentId: "payment-1", proposedPaymentMethodId: "method-2", proposedAmount: 150, amountDelta: 50,
    });
    request.approve("approver-1");
    expect(request.status).toBe("APPROVED");
    expect(request.decidedBy).toBe("approver-1");
    expect(request.decidedAt).not.toBeNull();
  });

  it("reject بيحدّث الحالة", () => {
    const request = PaymentAdjustmentRequest.register({
      paymentId: "payment-1", proposedPaymentMethodId: "method-2", proposedAmount: 150, amountDelta: 50,
    });
    request.reject("approver-1");
    expect(request.status).toBe("REJECTED");
  });

  it("بيرفض تقرير تاني على طلب اتقرر فيه بالفعل", () => {
    const request = PaymentAdjustmentRequest.register({
      paymentId: "payment-1", proposedPaymentMethodId: "method-2", proposedAmount: 150, amountDelta: 50,
    });
    request.approve("approver-1");
    expect(() => request.approve("approver-2")).toThrow(AdjustmentRequestAlreadyDecidedError);
    expect(() => request.reject("approver-2")).toThrow(AdjustmentRequestAlreadyDecidedError);
  });
});
