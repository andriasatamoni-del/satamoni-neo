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
  kitchen_accepted_at: Date | null;
  kitchen_ready_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  legacy_order_id: number | null;
  payment_method_id: string | null;
  rating_token: Generated<string>;
  client_request_id: string | null;
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

export interface OrderItemModifiersTable {
  id: Generated<string>;
  order_item_id: string;
  modifier_id: string | null;
  name_at_sale: string;
  price_at_sale: number;
}

export interface OrderRatingsTable {
  id: string;
  order_id: string;
  branch_id: string | null;
  stars: number;
  comment: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
