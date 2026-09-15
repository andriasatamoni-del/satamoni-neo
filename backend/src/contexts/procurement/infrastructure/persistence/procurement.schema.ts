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
