import { DEFAULT_POS_SETTINGS, PosSettings } from "../../../src/contexts/settings/domain/pos-settings.aggregate";

describe("PosSettings aggregate", () => {
  it("default() بيرجّع نفس القيم الافتراضية القديمة (نفس السلوك قبل الإعدادات)", () => {
    const settings = PosSettings.default();
    expect(settings.shiftVarianceAckThresholdEgp).toBe(DEFAULT_POS_SETTINGS.shiftVarianceAckThresholdEgp);
    expect(settings.driverSettlementVarianceAckThresholdEgp).toBe(DEFAULT_POS_SETTINGS.driverSettlementVarianceAckThresholdEgp);
    expect(settings.driverHourlyRateEgp).toBe(DEFAULT_POS_SETTINGS.driverHourlyRateEgp);
    expect(settings.paymentAdjustmentHighThresholdEgp).toBe(DEFAULT_POS_SETTINGS.paymentAdjustmentHighThresholdEgp);
    expect(settings.productionVarianceAlertPercent).toBe(DEFAULT_POS_SETTINGS.productionVarianceAlertPercent);
  });

  it("update بيحدّث الحقول المبعوتة بس ويسجّل مين عدّل ومتى", () => {
    const settings = PosSettings.default();
    const before = settings.updatedAt;
    settings.update({ shiftVarianceAckThresholdEgp: 50 }, "admin-1");
    expect(settings.shiftVarianceAckThresholdEgp).toBe(50);
    expect(settings.driverHourlyRateEgp).toBe(DEFAULT_POS_SETTINGS.driverHourlyRateEgp);
    expect(settings.updatedBy).toBe("admin-1");
    expect(settings.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
