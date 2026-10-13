// Drizzle table definitions for the shared (audit / event outbox) tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, jsonb, timestamp, check, uuid, integer, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bigintString } from "./columns";
import { branches } from "../../contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../contexts/identity-access/infrastructure/persistence/identity-access.tables";

export const eventOutbox = pgTable("event_outbox", {
  id: bigintString().primaryKey().notNull(),
  event_name: text().notNull(),
  payload: jsonb().notNull().$type<Record<string, unknown>>(),
  occurred_at: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  recorded_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigintString().primaryKey().notNull(),
  actor_user_id: uuid(),
  action: text().notNull(),
  entity_type: text(),
  entity_id: text(),
  branch_id: uuid(),
  metadata: jsonb().$type<Record<string, unknown>>(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  outcome: text().default('SUCCESS').notNull().$type<"SUCCESS" | "DENIED" | "FAILED">(),
  http_status: integer(),
}, (table) => [
  index("idx_audit_logs_actor").using("btree", table.actor_user_id.asc().nullsLast()),
  index("idx_audit_logs_created").using("btree", table.created_at.desc().nullsFirst()),
  index("idx_audit_logs_entity").using("btree", table.entity_type.asc().nullsLast(), table.entity_id.asc().nullsLast()),
  foreignKey({
      columns: [table.actor_user_id],
      foreignColumns: [users.id],
      name: "audit_logs_actor_user_id_fkey"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "audit_logs_branch_id_fkey"
    }).onDelete("set null"),
  check("audit_logs_outcome_check", sql`outcome = ANY (ARRAY['SUCCESS'::text, 'DENIED'::text, 'FAILED'::text])`),
]);
