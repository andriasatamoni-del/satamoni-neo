import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { DEFAULT_POS_SETTINGS, PosSettings } from "../../domain/pos-settings.aggregate";
import type { PosSettingsRepositoryPort } from "../../domain/ports/pos-settings-repository.port";
import type { PosSettingsTable } from "./pos-settings.schema";

const SINGLETON_ID = 1;

@Injectable()
export class KyselyPosSettingsRepository implements PosSettingsRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async get(): Promise<PosSettings> {
    const row = await this.db.selectFrom("pos_settings").selectAll().where("id", "=", SINGLETON_ID).executeTakeFirst();
    if (row) return this.toDomain(row);

    await this.db
      .insertInto("pos_settings")
      .values({
        id: SINGLETON_ID,
        shift_variance_ack_threshold_egp: DEFAULT_POS_SETTINGS.shiftVarianceAckThresholdEgp,
        driver_settlement_variance_ack_threshold_egp: DEFAULT_POS_SETTINGS.driverSettlementVarianceAckThresholdEgp,
        driver_hourly_rate_egp: DEFAULT_POS_SETTINGS.driverHourlyRateEgp,
        payment_adjustment_high_threshold_egp: DEFAULT_POS_SETTINGS.paymentAdjustmentHighThresholdEgp,
        production_variance_alert_percent: DEFAULT_POS_SETTINGS.productionVarianceAlertPercent,
        updated_by: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    const inserted = await this.db.selectFrom("pos_settings").selectAll().where("id", "=", SINGLETON_ID).executeTakeFirstOrThrow();
    return this.toDomain(inserted);
  }

  async save(settings: PosSettings): Promise<void> {
    await this.db
      .insertInto("pos_settings")
      .values({
        id: SINGLETON_ID,
        shift_variance_ack_threshold_egp: settings.shiftVarianceAckThresholdEgp,
        driver_settlement_variance_ack_threshold_egp: settings.driverSettlementVarianceAckThresholdEgp,
        driver_hourly_rate_egp: settings.driverHourlyRateEgp,
        payment_adjustment_high_threshold_egp: settings.paymentAdjustmentHighThresholdEgp,
        production_variance_alert_percent: settings.productionVarianceAlertPercent,
        updated_by: settings.updatedBy,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          shift_variance_ack_threshold_egp: settings.shiftVarianceAckThresholdEgp,
          driver_settlement_variance_ack_threshold_egp: settings.driverSettlementVarianceAckThresholdEgp,
          driver_hourly_rate_egp: settings.driverHourlyRateEgp,
          payment_adjustment_high_threshold_egp: settings.paymentAdjustmentHighThresholdEgp,
          production_variance_alert_percent: settings.productionVarianceAlertPercent,
          updated_by: settings.updatedBy,
          updated_at: new Date(),
        })
      )
      .execute();
  }

  private toDomain(row: Selectable<PosSettingsTable>): PosSettings {
    return PosSettings.reconstitute({
      shiftVarianceAckThresholdEgp: Number(row.shift_variance_ack_threshold_egp),
      driverSettlementVarianceAckThresholdEgp: Number(row.driver_settlement_variance_ack_threshold_egp),
      driverHourlyRateEgp: Number(row.driver_hourly_rate_egp),
      paymentAdjustmentHighThresholdEgp: Number(row.payment_adjustment_high_threshold_egp),
      productionVarianceAlertPercent: Number(row.production_variance_alert_percent),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    });
  }
}
