// نفس مفهوم pos_settings في الريبو القديم بالظبط - صف واحد ثابت (singleton) بيحدد قيم قابلة للتهيئة
// كانت متثبّتة في كود contexts تانية (shifts، delivery، payment-control، production) - راجع تعليقاتهم
// القديمة اللي بتشاور على "مفيش جدول إعدادات لسه". القيم الافتراضية هنا هي نفس القيم الثابتة اللي
// كانت مكتوبة في كل context قبل كده بالظبط، عشان النظام يفضل شغال بنفس السلوك لحد ما حد يغيّرها فعليًا.
export interface PosSettingsProps {
  shiftVarianceAckThresholdEgp: number;
  driverSettlementVarianceAckThresholdEgp: number;
  driverHourlyRateEgp: number;
  paymentAdjustmentHighThresholdEgp: number;
  productionVarianceAlertPercent: number;
  // بوت الرد الآلي على واتساب/ماسنجر/إنستجرام - مقفول افتراضيًا (نفس pos_settings.whatsapp_bot_enabled
  // في الريبو القديم). حتى لو مفتوح، مش بيرد غير لو GEMINI_API_KEY متضاف
  whatsappBotEnabled: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}

export const DEFAULT_POS_SETTINGS: PosSettingsProps = {
  shiftVarianceAckThresholdEgp: 20,
  driverSettlementVarianceAckThresholdEgp: 30,
  driverHourlyRateEgp: 33,
  paymentAdjustmentHighThresholdEgp: 500,
  productionVarianceAlertPercent: 10,
  whatsappBotEnabled: false,
  updatedBy: null,
  updatedAt: new Date(0),
};

export class PosSettings {
  private constructor(private props: PosSettingsProps) {}

  static default(): PosSettings {
    return new PosSettings({ ...DEFAULT_POS_SETTINGS, updatedAt: new Date() });
  }

  static reconstitute(props: PosSettingsProps): PosSettings {
    return new PosSettings(props);
  }

  update(input: Partial<Omit<PosSettingsProps, "updatedBy" | "updatedAt">>, updatedBy: string | null): void {
    if (input.shiftVarianceAckThresholdEgp !== undefined) this.props.shiftVarianceAckThresholdEgp = input.shiftVarianceAckThresholdEgp;
    if (input.driverSettlementVarianceAckThresholdEgp !== undefined) {
      this.props.driverSettlementVarianceAckThresholdEgp = input.driverSettlementVarianceAckThresholdEgp;
    }
    if (input.driverHourlyRateEgp !== undefined) this.props.driverHourlyRateEgp = input.driverHourlyRateEgp;
    if (input.paymentAdjustmentHighThresholdEgp !== undefined) {
      this.props.paymentAdjustmentHighThresholdEgp = input.paymentAdjustmentHighThresholdEgp;
    }
    if (input.productionVarianceAlertPercent !== undefined) this.props.productionVarianceAlertPercent = input.productionVarianceAlertPercent;
    if (input.whatsappBotEnabled !== undefined) this.props.whatsappBotEnabled = input.whatsappBotEnabled;
    this.props.updatedBy = updatedBy;
    this.props.updatedAt = new Date();
  }

  get shiftVarianceAckThresholdEgp(): number { return this.props.shiftVarianceAckThresholdEgp; }
  get driverSettlementVarianceAckThresholdEgp(): number { return this.props.driverSettlementVarianceAckThresholdEgp; }
  get driverHourlyRateEgp(): number { return this.props.driverHourlyRateEgp; }
  get paymentAdjustmentHighThresholdEgp(): number { return this.props.paymentAdjustmentHighThresholdEgp; }
  get productionVarianceAlertPercent(): number { return this.props.productionVarianceAlertPercent; }
  get whatsappBotEnabled(): boolean { return this.props.whatsappBotEnabled; }
  get updatedBy(): string | null { return this.props.updatedBy; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
