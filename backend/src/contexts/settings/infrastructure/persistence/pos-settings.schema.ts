import type { Generated } from "kysely";

export interface PosSettingsTable {
  id: Generated<number>;
  shift_variance_ack_threshold_egp: number;
  driver_settlement_variance_ack_threshold_egp: number;
  driver_hourly_rate_egp: number;
  payment_adjustment_high_threshold_egp: number;
  production_variance_alert_percent: number;
  updated_by: string | null;
  updated_at: Generated<Date>;
}
