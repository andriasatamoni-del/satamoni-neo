import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { DEFAULT_POS_SETTINGS, PosSettings } from "../../domain/pos-settings.aggregate";
import type { PosSettingsRepositoryPort } from "../../domain/ports/pos-settings-repository.port";
import { posSettings } from "./settings.tables";

const SINGLETON_ID = 1;

@Injectable()
export class PosSettingsRepository implements PosSettingsRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(): Promise<PosSettings> {
    const [row] = await this.db.select().from(posSettings).where(eq(posSettings.id, SINGLETON_ID)).limit(1);
    if (row) return this.toDomain(row);

    await this.db
      .insert(posSettings)
      .values({
        id: SINGLETON_ID,
        shift_variance_ack_threshold_egp: DEFAULT_POS_SETTINGS.shiftVarianceAckThresholdEgp,
        driver_settlement_variance_ack_threshold_egp: DEFAULT_POS_SETTINGS.driverSettlementVarianceAckThresholdEgp,
        driver_hourly_rate_egp: DEFAULT_POS_SETTINGS.driverHourlyRateEgp,
        payment_adjustment_high_threshold_egp: DEFAULT_POS_SETTINGS.paymentAdjustmentHighThresholdEgp,
        production_variance_alert_percent: DEFAULT_POS_SETTINGS.productionVarianceAlertPercent,
        updated_by: null,
      })
      .onConflictDoNothing({ target: posSettings.id });

    const [inserted] = await this.db.select().from(posSettings).where(eq(posSettings.id, SINGLETON_ID)).limit(1);
    if (!inserted) throw new Error("pos_settings row missing after insert");
    return this.toDomain(inserted);
  }

  async save(settings: PosSettings): Promise<void> {
    const values = {
      shift_variance_ack_threshold_egp: settings.shiftVarianceAckThresholdEgp,
      driver_settlement_variance_ack_threshold_egp: settings.driverSettlementVarianceAckThresholdEgp,
      driver_hourly_rate_egp: settings.driverHourlyRateEgp,
      payment_adjustment_high_threshold_egp: settings.paymentAdjustmentHighThresholdEgp,
      production_variance_alert_percent: settings.productionVarianceAlertPercent,
      whatsapp_bot_enabled: settings.whatsappBotEnabled,
      sms_confirmations_enabled: settings.smsConfirmationsEnabled,
      sms_rating_requests_enabled: settings.smsRatingRequestsEnabled,
      online_ordering_enabled: settings.onlineOrderingEnabled,
      loyalty_points_per_egp: settings.loyaltyPointsPerEgp,
      updated_by: settings.updatedBy,
    };
    await this.db
      .insert(posSettings)
      .values({ id: SINGLETON_ID, ...values })
      .onConflictDoUpdate({ target: posSettings.id, set: { ...values, updated_at: new Date() } });
  }

  private toDomain(row: typeof posSettings.$inferSelect): PosSettings {
    return PosSettings.reconstitute({
      shiftVarianceAckThresholdEgp: Number(row.shift_variance_ack_threshold_egp),
      driverSettlementVarianceAckThresholdEgp: Number(row.driver_settlement_variance_ack_threshold_egp),
      driverHourlyRateEgp: Number(row.driver_hourly_rate_egp),
      paymentAdjustmentHighThresholdEgp: Number(row.payment_adjustment_high_threshold_egp),
      productionVarianceAlertPercent: Number(row.production_variance_alert_percent),
      whatsappBotEnabled: Boolean(row.whatsapp_bot_enabled),
      smsConfirmationsEnabled: Boolean(row.sms_confirmations_enabled),
      smsRatingRequestsEnabled: Boolean(row.sms_rating_requests_enabled),
      onlineOrderingEnabled: Boolean(row.online_ordering_enabled),
      loyaltyPointsPerEgp: Number(row.loyalty_points_per_egp ?? 0.1),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    });
  }
}
