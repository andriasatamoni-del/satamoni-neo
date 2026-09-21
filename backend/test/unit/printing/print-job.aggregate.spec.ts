import { PrintJob } from "../../../src/contexts/printing/domain/print-job.aggregate";

describe("PrintJob aggregate", () => {
  it("queue بحالة PENDING لو فيه طابعة موجّهة", () => {
    const job = PrintJob.queue({
      branchId: "b1", printType: "CUSTOMER_RECEIPT", printerId: "p1",
      contentHtml: "<html></html>", idempotencyKey: "k1",
    });
    expect(job.status).toBe("PENDING");
    expect(job.printerId).toBe("p1");
    expect(job.lastError).toBeNull();
  });

  it("queue بحالة FAILED فورًا لو مفيش طابعة موجّهة، بسبب واضح", () => {
    const job = PrintJob.queue({
      branchId: "b1", printType: "KITCHEN_TICKET", contentHtml: "<html></html>", idempotencyKey: "k2",
      errorReason: "الأصناف دي مش مربوطة بأي محطة تحضير",
    });
    expect(job.status).toBe("FAILED");
    expect(job.printerId).toBeNull();
    expect(job.lastError).toBe("الأصناف دي مش مربوطة بأي محطة تحضير");
    expect(job.failedAt).not.toBeNull();
  });

  it("queue بيستخدم رسالة افتراضية لو مفيش errorReason متبعوت", () => {
    const job = PrintJob.queue({ branchId: "b1", printType: "TEST_PRINT", contentHtml: "<html></html>", idempotencyKey: "k3" });
    expect(job.lastError).toContain("لا يوجد طابعة موجّهة");
  });
});
