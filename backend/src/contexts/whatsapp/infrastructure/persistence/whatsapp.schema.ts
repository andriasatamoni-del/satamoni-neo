import type { Generated } from "kysely";

export interface WhatsappConversationsTable {
  id: string;
  phone: string;
  customer_name: string | null;
  last_message_at: Date | null;
  created_at: Generated<Date>;
}

export interface WhatsappMessagesTable {
  id: string;
  conversation_id: string;
  direction: string;
  body: string;
  wa_message_id: string | null;
  sent_by: string | null;
  created_at: Generated<Date>;
}

export interface WhatsappPendingOrdersTable {
  id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  order_type: string;
  branch_id: string;
  address_details: string | null;
  total: number;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  confirmed_order_id: string | null;
  created_at: Generated<Date>;
}

export interface WhatsappPendingOrderLinesTable {
  id: string;
  pending_order_id: string;
  variant_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
}
