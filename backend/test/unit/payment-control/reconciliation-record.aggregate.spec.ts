import { ReconciliationRecord } from "../../../src/contexts/payment-control/domain/reconciliation-record.aggregate";
import { ReconciliationRecordAlreadyDecidedError } from "../../../src/contexts/payment-control/domain/errors";

describe("ReconciliationRecord aggregate", () => {
  it("بيتسجّل UNMATCHED", () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date() });
    expect(record.matchStatus).toBe("UNMATCHED");
  });

  it("match بيحدّث الحالة والدفعة المرتبطة", () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date() });
    record.match("payment-1");
    expect(record.matchStatus).toBe("MATCHED");
    expect(record.matchedPaymentId).toBe("payment-1");
  });

  it("ignore بيحدّث الحالة من غير ما يربط دفعة", () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date() });
    record.ignore();
    expect(record.matchStatus).toBe("IGNORED");
    expect(record.matchedPaymentId).toBeNull();
  });

  it("بيرفض قرار تاني على سطر اتقرر فيه بالفعل", () => {
    const record = ReconciliationRecord.register({ source: "instapay", externalAmount: 100, externalDate: new Date() });
    record.match("payment-1");
    expect(() => record.match("payment-2")).toThrow(ReconciliationRecordAlreadyDecidedError);
    expect(() => record.ignore()).toThrow(ReconciliationRecordAlreadyDecidedError);
  });
});
