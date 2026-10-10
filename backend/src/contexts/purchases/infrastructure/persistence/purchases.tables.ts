// Drizzle table definitions for the purchases tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, boolean, numeric, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { suppliers } from "../../../procurement/infrastructure/persistence/procurement.tables";

export const purchases = pgTable("purchases", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  business_date: localDate().notNull(),
  category: text(),
  amount: numeric().notNull().$type<number>(),
  notes: text(),
  supplier_id: uuid(),
  supplier_document_number: text(),
  status: text().default('PENDING').notNull(),
  created_by: uuid(),
  reviewed_by: uuid(),
  reviewed_at: timestamp({ withTimezone: true, mode: "date" }),
  rejection_reason: text(),
  posted_to_inventory: boolean().default(false).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_purchases_branch_date").using("btree", table.branch_id.asc().nullsLast(), table.business_date.asc().nullsLast()),
  index("idx_purchases_supplier_doc").using("btree", table.supplier_id.asc().nullsLast(), table.supplier_document_number.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "purchases_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "purchases_created_by_fkey"
    }),
  foreignKey({
      columns: [table.reviewed_by],
      foreignColumns: [users.id],
      name: "purchases_reviewed_by_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "purchases_supplier_id_fkey"
    }),
  check("purchases_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text])`),
]);

export const purchaseLines = pgTable("purchase_lines", {
  id: uuid().primaryKey().notNull(),
  purchase_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit: text(),
  unit_price: numeric().notNull().$type<number>(),
  line_total: numeric().notNull().$type<number>(),
}, (table) => [
  index("idx_purchase_lines_purchase").using("btree", table.purchase_id.asc().nullsLast()),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "purchase_lines_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.purchase_id],
      foreignColumns: [purchases.id],
      name: "purchase_lines_purchase_id_fkey"
    }).onDelete("cascade"),
]);
