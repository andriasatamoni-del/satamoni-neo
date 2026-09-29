import { Inject, Injectable, Logger } from "@nestjs/common";
import { GetPosSettingsHandler } from "../../settings/application/queries/get-pos-settings.handler";
import { SMS_GATEWAY, type SmsGatewayPort } from "../domain/ports/sms-gateway.port";
import {
  ORDER_NOTIFICATION_STORE,
  type OrderNotificationKind,
  type OrderNotificationStorePort,
} from "../domain/ports/order-notification-store.port";

// العميل مش قدّام الكاشير يشوف الفاتورة (دليفري/تيك أواي تليفون). الصالة بيشوف الفاتورة على الترابيزة
const NOTIFIABLE_ORDER_TYPES = ["delivery", "takeaway"];

export function publicAppUrl(): string | null {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const firstOrigin = process.env.FRONTEND_ORIGIN?.split(",")[0]?.trim();
  return firstOrigin ? firstOrigin.replace(/\/$/, "") : null;
}

// نفس db/order-notifications.js في الريبو القديم: تأكيد وقت التسجيل + طلب تقييم وقت ما الطلب يوصل
// (completed للدليفري، READY من المطبخ للتيك أواي - أقرب إشارة لـ"جاهز للعميل"). بيشتغل كمستهلك أحداث
// بعد ما الطلب اتسجّل فعلًا، فأي فشل هنا عمره ما بيأثر على الطلب نفسه.
@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly getSettings: GetPosSettingsHandler,
    @Inject(SMS_GATEWAY) private readonly sms: SmsGatewayPort,
    @Inject(ORDER_NOTIFICATION_STORE) private readonly store: OrderNotificationStorePort
  ) {}

  async onOrderRegistered(orderId: string): Promise<void> {
    const settings = await this.getSettings.execute();
    if (!settings.smsConfirmationsEnabled) return;
    const order = await this.store.findOrder(orderId);
    if (!order?.customerPhone || !NOTIFIABLE_ORDER_TYPES.includes(order.orderType)) return;

    const message = `ستاموني - اتسجل طلبك رقم ${order.id.slice(0, 8)} بمبلغ ${order.total.toFixed(2)} ج.م. شكرًا لثقتك!`;
    await this.send(order.id, "confirmation", order.customerPhone, message);
  }

  async onOrderDelivered(orderId: string): Promise<void> {
    const settings = await this.getSettings.execute();
    if (!settings.smsRatingRequestsEnabled) return;
    const order = await this.store.findOrder(orderId);
    if (!order?.customerPhone || !NOTIFIABLE_ORDER_TYPES.includes(order.orderType)) return;

    const baseUrl = publicAppUrl();
    if (!baseUrl) {
      this.logger.warn("rating request skipped: PUBLIC_APP_URL/FRONTEND_ORIGIN not set");
      return;
    }
    const link = `${baseUrl}/rate/${order.id}?token=${order.ratingToken}`;
    const message = `ستاموني - نورتنا! ممكن تقيّم تجربتك مع طلب رقم ${order.id.slice(0, 8)} من هنا: ${link}`;
    await this.send(order.id, "rating_request", order.customerPhone, message);
  }

  private async send(orderId: string, kind: OrderNotificationKind, recipient: string, message: string): Promise<void> {
    const reservationId = await this.store.reserve({ orderId, kind, recipient, message });
    if (!reservationId) return;
    const result = await this.sms.send({ to: recipient, message });
    await this.store.complete(reservationId, { status: result.status, error: result.status === "failed" ? result.error : null });
    if (result.status === "failed") this.logger.warn(`order ${kind} SMS failed for ${orderId}: ${result.error}`);
  }
}
