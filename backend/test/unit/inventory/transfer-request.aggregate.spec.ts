import { TransferRequest } from "../../../src/contexts/inventory/domain/transfer-request.aggregate";
import {
  EmptyTransferRequestError,
  SameBranchTransferError,
  TransferRequestNotDecidableError,
  TransferRequestNotDispatchableError,
  TransferRequestNotReceivableError,
  TransferRequestNotCancellableError,
  TransferRequestCancellationReasonRequiredError,
  TransferRequestRejectionReasonRequiredError,
} from "../../../src/contexts/inventory/domain/errors";

function register() {
  return TransferRequest.register({
    fromBranchId: "ck-1",
    toBranchId: "branch-1",
    lines: [{ inventoryItemId: "item-1", requestedQuantity: 10 }],
  });
}

describe("TransferRequest aggregate", () => {
  it("register بيرفض طلب من غير بنود", () => {
    expect(() => TransferRequest.register({ fromBranchId: "ck-1", toBranchId: "branch-1", lines: [] })).toThrow(EmptyTransferRequestError);
  });

  it("register بيرفض تحويل لنفس الفرع", () => {
    expect(() =>
      TransferRequest.register({ fromBranchId: "ck-1", toBranchId: "ck-1", lines: [{ inventoryItemId: "item-1", requestedQuantity: 5 }] })
    ).toThrow(SameBranchTransferError);
  });

  it("دورة حياة كاملة: SUBMITTED -> APPROVED -> DISPATCHED -> RECEIVED", () => {
    const request = register();
    expect(request.status).toBe("SUBMITTED");

    request.approve({ approvedBy: "u1" });
    expect(request.status).toBe("APPROVED");
    expect(request.lines[0].approvedQuantity).toBe(10);

    request.dispatch({ dispatchedBy: "u1", movements: [{ lineId: request.lines[0].id, quantity: 10, movementId: "mv-out" }] });
    expect(request.status).toBe("DISPATCHED");
    expect(request.lines[0].dispatchedQuantity).toBe(10);

    request.receive({ receivedBy: "u2", movements: [{ lineId: request.lines[0].id, quantity: 9, movementId: "mv-in" }] });
    expect(request.status).toBe("RECEIVED");
    expect(request.lines[0].receivedQuantity).toBe(9); // فقد جزئي أثناء النقل - واضح في الفرق
  });

  it("approve بيسمح بتعديل الكمية المعتمدة لكل بند", () => {
    const request = register();
    request.approve({ approvedBy: "u1", approvedQuantities: { [request.lines[0].id]: 6 } });
    expect(request.lines[0].approvedQuantity).toBe(6);
  });

  it("مايصحش تعتمد طلب مش SUBMITTED", () => {
    const request = register();
    request.approve({ approvedBy: "u1" });
    expect(() => request.approve({ approvedBy: "u1" })).toThrow(TransferRequestNotDecidableError);
  });

  it("reject بيحتاج سبب", () => {
    const request = register();
    expect(() => request.reject({ rejectedBy: "u1", reason: "" })).toThrow(TransferRequestRejectionReasonRequiredError);
    request.reject({ rejectedBy: "u1", reason: "مفيش رصيد كفاية" });
    expect(request.status).toBe("REJECTED");
  });

  it("مايصحش تشحن طلب مش معتمد", () => {
    const request = register();
    expect(() => request.dispatch({ dispatchedBy: "u1", movements: [] })).toThrow(TransferRequestNotDispatchableError);
  });

  it("مايصحش تستلم طلب مش متشحن", () => {
    const request = register();
    request.approve({ approvedBy: "u1" });
    expect(() => request.receive({ receivedBy: "u2", movements: [] })).toThrow(TransferRequestNotReceivableError);
  });

  it("cancel بيحتاج سبب، ومش ممكن بعد الشحن", () => {
    const request = register();
    expect(() => request.cancel({ cancelledBy: "u1", reason: "" })).toThrow(TransferRequestCancellationReasonRequiredError);
    request.cancel({ cancelledBy: "u1", reason: "اتلغى بطلب الفرع" });
    expect(request.status).toBe("CANCELLED");

    const dispatched = register();
    dispatched.approve({ approvedBy: "u1" });
    dispatched.dispatch({ dispatchedBy: "u1", movements: [{ lineId: dispatched.lines[0].id, quantity: 10, movementId: "mv-1" }] });
    expect(() => dispatched.cancel({ cancelledBy: "u1", reason: "سبب" })).toThrow(TransferRequestNotCancellableError);
  });
});
