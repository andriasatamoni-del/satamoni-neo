// Drizzle table definitions for the procurement tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, integer, numeric, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { journalEntries } from "../../../accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { treasuries } from "../../../treasury/infrastructure/persistence/treasury.tables";

export const suppliers = pgTable("suppliers", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  contact_person: text(),
  phone: text(),
  email: text(),
  address: text(),
  payment_terms: text(),
  status: text().default('ACTIVE').notNull(),
  legacy_supplier_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("suppliers_name_key").on(table.name),
  check("suppliers_status_check", sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'BLOCKED'::text])`),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  purchase_order_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit_price: numeric().notNull().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "purchase_order_items_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.purchase_order_id],
      foreignColumns: [purchaseOrders.id],
      name: "purchase_order_items_purchase_order_id_fkey"
    }).onDelete("cascade"),
]);

export const supplierInvoices = pgTable("supplier_invoices", {
  id: uuid().primaryKey().notNull(),
  supplier_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  goods_receipt_id: uuid(),
  supplier_invoice_number: text().notNull(),
  invoice_date: localDate().default(sql`CURRENT_DATE`).notNull(),
  due_date: localDate(),
  subtotal: numeric().notNull().$type<number>(),
  tax: numeric().default('0').notNull().$type<number>(),
  total: numeric().notNull().$type<number>(),
  matched_total: numeric().default('0').notNull().$type<number>(),
  variance_amount: numeric().default('0').notNull().$type<number>(),
  status: text().notNull(),
  variance_journal_entry_id: uuid(),
  notes: text(),
  created_by: uuid(),
  approved_by: uuid(),
  approved_at: timestamp({ withTimezone: true, mode: "date" }),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_reason: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.approved_by],
      foreignColumns: [users.id],
      name: "supplier_invoices_approved_by_fkey"
    }),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "supplier_invoices_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "supplier_invoices_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "supplier_invoices_created_by_fkey"
    }),
  foreignKey({
      columns: [table.goods_receipt_id],
      foreignColumns: [goodsReceipts.id],
      name: "supplier_invoices_goods_receipt_id_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "supplier_invoices_supplier_id_fkey"
    }),
  foreignKey({
      columns: [table.variance_journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "supplier_invoices_variance_journal_entry_id_fkey"
    }),
  unique("supplier_invoices_supplier_id_number_key").on(table.supplier_id, table.supplier_invoice_number),
  check("supplier_invoices_status_check", sql`status = ANY (ARRAY['MATCHED'::text, 'VARIANCE_PENDING'::text, 'APPROVED'::text, 'PARTIALLY_PAID'::text, 'PAID'::text, 'CANCELLED'::text])`),
]);

export const supplierInvoiceLines = pgTable("supplier_invoice_lines", {
  id: uuid().primaryKey().notNull(),
  supplier_invoice_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  invoiced_quantity: numeric().notNull().$type<number>(),
  unit_price: numeric().notNull().$type<number>(),
  line_total: numeric().notNull().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "supplier_invoice_lines_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.supplier_invoice_id],
      foreignColumns: [supplierInvoices.id],
      name: "supplier_invoice_lines_supplier_invoice_id_fkey"
    }),
]);

export const supplierPayments = pgTable("supplier_payments", {
  id: uuid().primaryKey().notNull(),
  supplier_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  supplier_invoice_id: uuid(),
  treasury_id: uuid().notNull(),
  amount: numeric().notNull().$type<number>(),
  payment_date: localDate().default(sql`CURRENT_DATE`).notNull(),
  reference_number: text(),
  notes: text(),
  journal_entry_id: uuid(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "supplier_payments_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "supplier_payments_created_by_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "supplier_payments_journal_entry_id_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "supplier_payments_supplier_id_fkey"
    }),
  foreignKey({
      columns: [table.supplier_invoice_id],
      foreignColumns: [supplierInvoices.id],
      name: "supplier_payments_supplier_invoice_id_fkey"
    }),
  foreignKey({
      columns: [table.treasury_id],
      foreignColumns: [treasuries.id],
      name: "supplier_payments_treasury_id_fkey"
    }),
]);

export const purchaseRequests = pgTable("purchase_requests", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  requested_by: uuid(),
  required_date: localDate(),
  reason: text(),
  status: text().default('DRAFT').notNull(),
  approved_by: uuid(),
  approved_at: timestamp({ withTimezone: true, mode: "date" }),
  rejected_by: uuid(),
  rejection_reason: text(),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  converted_to_purchase_order_id: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.approved_by],
      foreignColumns: [users.id],
      name: "purchase_requests_approved_by_fkey"
    }),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "purchase_requests_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "purchase_requests_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.converted_to_purchase_order_id],
      foreignColumns: [purchaseOrders.id],
      name: "purchase_requests_converted_to_purchase_order_id_fkey"
    }),
  foreignKey({
      columns: [table.rejected_by],
      foreignColumns: [users.id],
      name: "purchase_requests_rejected_by_fkey"
    }),
  foreignKey({
      columns: [table.requested_by],
      foreignColumns: [users.id],
      name: "purchase_requests_requested_by_fkey"
    }),
  check("purchase_requests_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'CONVERTED_TO_PO'::text, 'CANCELLED'::text])`),
]);

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: uuid().primaryKey().notNull(),
  purchase_request_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  requested_quantity: numeric().notNull().$type<number>(),
  unit: text(),
  notes: text(),
}, (table) => [
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "purchase_request_items_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.purchase_request_id],
      foreignColumns: [purchaseRequests.id],
      name: "purchase_request_items_purchase_request_id_fkey"
    }).onDelete("cascade"),
]);

export const purchaseReturns = pgTable("purchase_returns", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  supplier_id: uuid(),
  goods_receipt_id: uuid(),
  status: text().default('DRAFT').notNull(),
  reason: text().notNull(),
  notes: text(),
  total_value: numeric().$type<number>(),
  journal_entry_id: uuid(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  posted_by: uuid(),
  posted_at: timestamp({ withTimezone: true, mode: "date" }),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "purchase_returns_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "purchase_returns_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "purchase_returns_created_by_fkey"
    }),
  foreignKey({
      columns: [table.goods_receipt_id],
      foreignColumns: [goodsReceipts.id],
      name: "purchase_returns_goods_receipt_id_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "purchase_returns_journal_entry_id_fkey"
    }),
  foreignKey({
      columns: [table.posted_by],
      foreignColumns: [users.id],
      name: "purchase_returns_posted_by_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "purchase_returns_supplier_id_fkey"
    }),
  check("purchase_returns_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'CANCELLED'::text])`),
]);

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: uuid().primaryKey().notNull(),
  purchase_return_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit: text().notNull(),
  unit_cost: numeric().$type<number>(),
  line_value: numeric().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "purchase_return_items_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.purchase_return_id],
      foreignColumns: [purchaseReturns.id],
      name: "purchase_return_items_purchase_return_id_fkey"
    }).onDelete("cascade"),
  check("purchase_return_items_quantity_check", sql`quantity > (0)::numeric`),
]);

export const goodsReceipts = pgTable("goods_receipts", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  purchase_order_id: uuid(),
  supplier_id: uuid(),
  branch_id: uuid().notNull(),
  status: text().default('DRAFT').notNull(),
  received_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  confirmed_at: timestamp({ withTimezone: true, mode: "date" }),
  legacy_goods_receipt_id: integer(),
  supplier_document_number: text(),
}, (table) => [
  index("idx_goods_receipts_supplier_doc").using("btree", table.supplier_id.asc().nullsLast(), table.supplier_document_number.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "goods_receipts_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.purchase_order_id],
      foreignColumns: [purchaseOrders.id],
      name: "goods_receipts_purchase_order_id_fkey"
    }),
  foreignKey({
      columns: [table.received_by],
      foreignColumns: [users.id],
      name: "goods_receipts_received_by_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "goods_receipts_supplier_id_fkey"
    }),
  check("goods_receipts_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text])`),
]);

export const goodsReceiptItems = pgTable("goods_receipt_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  goods_receipt_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit_cost: numeric().notNull().$type<number>(),
  expiry_date: localDate(),
  production_date: localDate(),
}, (table) => [
  foreignKey({
      columns: [table.goods_receipt_id],
      foreignColumns: [goodsReceipts.id],
      name: "goods_receipt_items_goods_receipt_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "goods_receipt_items_inventory_item_id_fkey"
    }),
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  supplier_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  status: text().default('DRAFT').notNull(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_purchase_order_id: integer(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "purchase_orders_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "purchase_orders_created_by_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "purchase_orders_supplier_id_fkey"
    }),
  check("purchase_orders_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'SENT'::text, 'PARTIALLY_RECEIVED'::text, 'RECEIVED'::text, 'CANCELLED'::text])`),
]);
