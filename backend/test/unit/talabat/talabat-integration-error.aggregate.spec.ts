import { TalabatIntegrationError } from "../../../src/contexts/talabat/domain/talabat-integration-error.aggregate";

describe("TalabatIntegrationError aggregate", () => {
  it("register بيسجّل خطأ بحالة OPEN وretryCount=0", () => {
    const error = TalabatIntegrationError.register({ stage: "SYNC", talabatOrderId: "TAL-1", message: "BRANCH_UNMAPPED" });
    expect(error.status).toBe("OPEN");
    expect(error.retryCount).toBe(0);
    expect(error.lastRetryAt).toBeNull();
  });

  it("markRetrying بيزود العداد ويحدّث آخر وقت محاولة", () => {
    const error = TalabatIntegrationError.register({ stage: "SYNC", message: "x" });
    error.markRetrying();
    expect(error.status).toBe("RETRYING");
    expect(error.retryCount).toBe(1);
    expect(error.lastRetryAt).not.toBeNull();

    error.markRetrying();
    expect(error.retryCount).toBe(2);
  });

  it("resolve بيقفل الخطأ، وreopen بيرجّعه مفتوح برسالة جديدة", () => {
    const error = TalabatIntegrationError.register({ stage: "SYNC", message: "x" });
    error.resolve();
    expect(error.status).toBe("RESOLVED");

    error.reopen("MAPPING_ERROR: صنف تاني مش مربوط");
    expect(error.status).toBe("OPEN");
    expect(error.message).toBe("MAPPING_ERROR: صنف تاني مش مربوط");
  });
});
