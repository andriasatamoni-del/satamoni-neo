export type OrderNotificationKind = "confirmation" | "rating_request";

export interface NotifiableOrder {
  id: string;
  orderType: string;
  customerPhone: string | null;
  total: number;
  ratingToken: string;
}

export interface OrderNotificationRecord {
  id: string;
  orderId: string;
  kind: OrderNotificationKind;
  channel: "sms";
  recipient: string;
  message: string;
  status: "sent" | "failed" | "not_configured";
  error: string | null;
  createdAt: Date;
}

export interface OrderNotificationStorePort {
  findOrder(orderId: string): Promise<NotifiableOrder | null>;
  // بيحجز (order_id, kind) قبل الإرسال - false لو اتحجز قبل كده (عشان الرسالة ماتتبعتش مرتين حتى لو
  // الحدث اتنشر مرتين)
  reserve(input: { orderId: string; kind: OrderNotificationKind; recipient: string; message: string }): Promise<string | null>;
  complete(id: string, result: { status: OrderNotificationRecord["status"]; error?: string | null }): Promise<void>;
  listRecent(limit: number): Promise<OrderNotificationRecord[]>;
}

export const ORDER_NOTIFICATION_STORE = Symbol("ORDER_NOTIFICATION_STORE");
