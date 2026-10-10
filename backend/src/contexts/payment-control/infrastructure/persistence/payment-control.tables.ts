// Drizzle table definitions for the payment-control tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const payments = pgTable("payments", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  order_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  payment_method_id: uuid().notNull(),
  method_kind: text().notNull(),
  settlement_channel: text(),
  amount: numeric().notNull().$type<number>(),
  locked_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  locked_by: uuid(),
  legacy_payment_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_payments_branch").using("btree", table.branch_id.asc().nullsLast()),
  index("idx_payments_settlement_channel").using("btree", table.settlement_channel.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "payments_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.locked_by],
      foreignColumns: [users.id],
      name: "payments_locked_by_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "payments_order_id_fkey"
    }),
  foreignKey({
      columns: [table.payment_method_id],
      foreignColumns: [paymentMethods.id],
      name: "payments_payment_method_id_fkey"
    }),
  unique("payments_order_id_key").on(table.order_id),
]);

export const paymentReconciliationRecords = pgTable("payment_reconciliation_records", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid(),
  source: text().notNull(),
  external_reference: text(),
  external_amount: numeric().notNull().$type<number>(),
  external_date: localDate().notNull(),
  matched_payment_id: uuid(),
  match_status: text().default('UNMATCHED').notNull(),
  notes: text(),
  entered_by: uuid(),
  entered_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_reconciliation_record_id: integer(),
  import_batch_id: uuid(),
}, (table) => [
  index("idx_payment_reconciliation_records_import_batch").using("btree", table.import_batch_id.asc().nullsLast()),
  index("idx_reconciliation_records_status").using("btree", table.match_status.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "payment_reconciliation_records_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.entered_by],
      foreignColumns: [users.id],
      name: "payment_reconciliation_records_entered_by_fkey"
    }),
  foreignKey({
      columns: [table.matched_payment_id],
      foreignColumns: [payments.id],
      name: "payment_reconciliation_records_matched_payment_id_fkey"
    }),
  check("payment_reconciliation_records_match_status_check", sql`match_status = ANY (ARRAY['UNMATCHED'::text, 'MATCHED'::text, 'IGNORED'::text])`),
  check("payment_reconciliation_records_source_check", sql`source = ANY (ARRAY['talabat_statement'::text, 'visa_settlement'::text, 'instapay'::text, 'orange_cash'::text])`),
]);

export const paymentMethods = pgTable("payment_methods", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  kind: text().notNull(),
  settlement_channel: text(),
  is_active: boolean().default(true).notNull(),
  legacy_payment_method_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  talabat_payment_code: text(),
}, (table) => [
  uniqueIndex("idx_payment_methods_talabat_payment_code").using("btree", table.talabat_payment_code.asc().nullsLast()),
  check("payment_methods_kind_check", sql`kind = ANY (ARRAY['cash'::text, 'card_or_wallet'::text, 'credit'::text])`),
  check("payment_methods_settlement_channel_check", sql`settlement_channel = ANY (ARRAY['visa_pos'::text, 'instapay'::text, 'orange_cash'::text, 'vodafone_cash'::text])`),
]);

export const paymentAdjustmentRequests = pgTable("payment_adjustment_requests", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  payment_id: uuid().notNull(),
  requested_by: uuid(),
  requested_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  reason: text(),
  proposed_payment_method_id: uuid(),
  proposed_amount: numeric().notNull().$type<number>(),
  amount_delta: numeric().notNull().$type<number>(),
  status: text().default('PENDING').notNull(),
  decided_by: uuid(),
  decided_at: timestamp({ withTimezone: true, mode: "date" }),
  legacy_adjustment_request_id: integer(),
  previous_payment_method_id: uuid(),
  previous_amount: numeric().$type<number>(),
}, (table) => [
  index("idx_adjustment_requests_payment").using("btree", table.payment_id.asc().nullsLast()),
  foreignKey({
      columns: [table.decided_by],
      foreignColumns: [users.id],
      name: "payment_adjustment_requests_decided_by_fkey"
    }),
  foreignKey({
      columns: [table.payment_id],
      foreignColumns: [payments.id],
      name: "payment_adjustment_requests_payment_id_fkey"
    }),
  foreignKey({
      columns: [table.previous_payment_method_id],
      foreignColumns: [paymentMethods.id],
      name: "payment_adjustment_requests_previous_payment_method_id_fkey"
    }),
  foreignKey({
      columns: [table.proposed_payment_method_id],
      foreignColumns: [paymentMethods.id],
      name: "payment_adjustment_requests_proposed_payment_method_id_fkey"
    }),
  foreignKey({
      columns: [table.requested_by],
      foreignColumns: [users.id],
      name: "payment_adjustment_requests_requested_by_fkey"
    }),
  check("payment_adjustment_requests_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])`),
]);
