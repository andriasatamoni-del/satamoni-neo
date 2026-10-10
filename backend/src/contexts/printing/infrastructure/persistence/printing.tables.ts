// Drizzle table definitions for the printing tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, integer, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const printers = pgTable("printers", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  name: text().notNull(),
  printer_type: text().notNull(),
  connection_type: text().default('USB').notNull(),
  os_printer_name: text(),
  ip_address: text(),
  port: integer(),
  paper_width_mm: integer().default(80).notNull(),
  is_enabled: boolean().default(true).notNull(),
  is_default_for_type: boolean().default(false).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "printers_branch_id_fkey"
    }),
  check("printers_connection_type_check", sql`connection_type = ANY (ARRAY['USB'::text, 'LAN'::text])`),
  check("printers_printer_type_check", sql`printer_type = ANY (ARRAY['CASHIER'::text, 'KITCHEN'::text, 'DELIVERY'::text, 'REPORT'::text])`),
]);

export const kitchenStations = pgTable("kitchen_stations", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  name: text().notNull(),
  printer_id: uuid(),
  is_active: boolean().default(true).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "kitchen_stations_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.printer_id],
      foreignColumns: [printers.id],
      name: "kitchen_stations_printer_id_fkey"
    }).onDelete("set null"),
  unique("uq_kitchen_stations_branch_name").on(table.branch_id, table.name),
]);

export const printJobs = pgTable("print_jobs", {
  id: uuid().primaryKey().notNull(),
  order_id: uuid(),
  branch_id: uuid().notNull(),
  print_type: text().notNull(),
  printer_id: uuid(),
  station_id: uuid(),
  status: text().default('PENDING').notNull(),
  content_html: text().notNull(),
  idempotency_key: text().notNull(),
  attempts: integer().default(0).notNull(),
  last_error: text(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  printing_started_at: timestamp({ withTimezone: true, mode: "date" }),
  printed_at: timestamp({ withTimezone: true, mode: "date" }),
  failed_at: timestamp({ withTimezone: true, mode: "date" }),
}, (table) => [
  index("idx_print_jobs_branch_status").using("btree", table.branch_id.asc().nullsLast(), table.status.asc().nullsLast()),
  index("idx_print_jobs_order").using("btree", table.order_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "print_jobs_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "print_jobs_created_by_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "print_jobs_order_id_fkey"
    }),
  foreignKey({
      columns: [table.printer_id],
      foreignColumns: [printers.id],
      name: "print_jobs_printer_id_fkey"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.station_id],
      foreignColumns: [kitchenStations.id],
      name: "print_jobs_station_id_fkey"
    }),
  unique("print_jobs_idempotency_key_key").on(table.idempotency_key),
  check("chk_print_jobs_order_id", sql`(order_id IS NOT NULL) OR (print_type = 'TEST_PRINT'::text)`),
  check("print_jobs_print_type_check", sql`print_type = ANY (ARRAY['CUSTOMER_RECEIPT'::text, 'KITCHEN_TICKET'::text, 'KITCHEN_SUMMARY'::text, 'DELIVERY_SUMMARY'::text, 'DELIVERY_FINAL_RECEIPT'::text, 'DINE_IN_BILL'::text, 'TEST_PRINT'::text])`),
  check("print_jobs_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'PRINTING'::text, 'PRINTED'::text, 'FAILED'::text, 'CANCELLED'::text])`),
]);
