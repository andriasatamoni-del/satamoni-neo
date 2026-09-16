import type { Generated } from "kysely";

export interface OrdersTable {
  id: Generated<string>;
  branch_id: string;
  order_type: string;
  table_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address_details: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  kitchen_status: string;
  created_by: string | null;
  created_at: Generated<Date>;
  legacy_order_id: number | null;
  payment_method_id: string | null;
}

export interface OrderItemsTable {
  id: Generated<string>;
  order_id: string;
  menu_item_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}
