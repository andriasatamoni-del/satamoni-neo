// Drizzle table definitions for the settings tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, timestamp, check, uuid, boolean, integer, numeric, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const posSettings = pgTable("pos_settings", {
  id: integer().primaryKey().notNull(),
  shift_variance_ack_threshold_egp: numeric().default('20').notNull().$type<number>(),
  driver_settlement_variance_ack_threshold_egp: numeric().default('30').notNull().$type<number>(),
  driver_hourly_rate_egp: numeric().default('33').notNull().$type<number>(),
  payment_adjustment_high_threshold_egp: numeric().default('500').notNull().$type<number>(),
  production_variance_alert_percent: numeric().default('10').notNull().$type<number>(),
  updated_by: uuid(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  whatsapp_bot_enabled: boolean().default(false).notNull(),
  sms_confirmations_enabled: boolean().default(false).notNull(),
  sms_rating_requests_enabled: boolean().default(false).notNull(),
  online_ordering_enabled: boolean().default(false).notNull(),
  loyalty_points_per_egp: numeric().default('0.1').notNull().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.updated_by],
      foreignColumns: [users.id],
      name: "pos_settings_updated_by_fkey"
    }),
  check("pos_settings_id_check", sql`id = 1`),
  check("pos_settings_loyalty_points_per_egp_check", sql`loyalty_points_per_egp >= (0)::numeric`),
]);
