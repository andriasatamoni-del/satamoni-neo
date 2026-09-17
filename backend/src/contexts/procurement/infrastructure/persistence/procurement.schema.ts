import type { Generated } from "kysely";

export interface SuppliersTable {
  id: Generated<string>;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  status: string;
  legacy_supplier_id: number | null;
  created_at: Generated<Date>;
}

export interface PurchaseOrdersTable {
  id: Generated<string>;
  supplier_id: string;
  branch_id: string;
  status: string;
  created_by: string | null;
  created_at: Generated<Date>;
  legacy_purchase_order_id: number | null;
}

export interface PurchaseOrderItemsTable {
  id: Generated<string>;
  purchase_order_id: string;
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
}

export interface GoodsReceiptsTable {
  id: Generated<string>;
  purchase_order_id: string | null;
  supplier_id: string | null;
  branch_id: string;
  status: string;
  received_by: string | null;
  created_at: Generated<Date>;
  confirmed_at: Date | null;
  legacy_goods_receipt_id: number | null;
}

export interface GoodsReceiptItemsTable {
  id: Generated<string>;
  goods_receipt_id: string;
  inventory_item_id: string;
  quantity: number;
  unit_cost: number;
}

export interface SupplierInvoicesTable {
  id: Generated<string>;
  supplier_id: string;
  branch_id: string;
  goods_receipt_id: string | null;
  supplier_invoice_number: string;
  invoice_date: Date;
  due_date: Date | null;
  subtotal: number;
  tax: number;
  total: number;
  matched_total: number;
  variance_amount: number;
  status: string;
  variance_journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupplierInvoiceLinesTable {
  id: Generated<string>;
  supplier_invoice_id: string;
  inventory_item_id: string;
  invoiced_quantity: number;
  unit_price: number;
  line_total: number;
}

export interface SupplierPaymentsTable {
  id: Generated<string>;
  supplier_id: string;
  branch_id: string;
  supplier_invoice_id: string | null;
  treasury_id: string;
  amount: number;
  payment_date: Date;
  reference_number: string | null;
  notes: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface PurchaseRequestsTable {
  id: Generated<string>;
  branch_id: string;
  requested_by: string | null;
  required_date: Date | null;
  reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  converted_to_purchase_order_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseRequestItemsTable {
  id: Generated<string>;
  purchase_request_id: string;
  inventory_item_id: string;
  requested_quantity: number;
  unit: string | null;
  notes: string | null;
}

export interface PurchaseReturnsTable {
  id: Generated<string>;
  branch_id: string;
  supplier_id: string | null;
  goods_receipt_id: string | null;
  status: string;
  reason: string;
  notes: string | null;
  total_value: number | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  posted_by: string | null;
  posted_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
}

export interface PurchaseReturnItemsTable {
  id: Generated<string>;
  purchase_return_id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  line_value: number | null;
}
