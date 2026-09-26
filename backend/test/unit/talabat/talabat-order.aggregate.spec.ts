import { TalabatOrder } from "../../../src/contexts/talabat/domain/talabat-order.aggregate";

describe("TalabatOrder aggregate", () => {
  it("receive() بيسجّل صف تتبّع بحالة RECEIVED", () => {
    const order = TalabatOrder.receive({ talabatOrderId: "TAL-1", rawPayload: { a: 1 } });
    expect(order.status).toBe("RECEIVED");
    expect(order.branchId).toBeNull();
    expect(order.posOrderId).toBeNull();
  });

  it("markMappingError بيسجّل السبب والفرع (لو معروف) من غير ما يربط أوردر POS", () => {
    const order = TalabatOrder.receive({ talabatOrderId: "TAL-2", rawPayload: {} });
    order.markMappingError({ branchId: "branch-1", reason: "PAYMENT_METHOD_UNMAPPED" });
    expect(order.status).toBe("MAPPING_ERROR");
    expect(order.branchId).toBe("branch-1");
    expect(order.errorReason).toBe("PAYMENT_METHOD_UNMAPPED");
    expect(order.posOrderId).toBeNull();
  });

  it("markImported بيربط أوردر POS الحقيقي ويصفّي أي سبب خطأ سابق", () => {
    const order = TalabatOrder.receive({ talabatOrderId: "TAL-3", rawPayload: {} });
    order.markMappingError({ branchId: "branch-1", reason: "MAPPING_ERROR" });
    order.markImported({ branchId: "branch-1", posOrderId: "order-1" });
    expect(order.status).toBe("IMPORTED");
    expect(order.posOrderId).toBe("order-1");
    expect(order.errorReason).toBeNull();
  });

  it("cancel بيسجّل مصدر الإلغاء والتوقيت", () => {
    const order = TalabatOrder.receive({ talabatOrderId: "TAL-4", rawPayload: {} });
    order.markImported({ branchId: "branch-1", posOrderId: "order-1" });
    order.cancel("TALABAT");
    expect(order.status).toBe("CANCELED");
    expect(order.cancellationSource).toBe("TALABAT");
    expect(order.canceledAt).not.toBeNull();
  });
});
