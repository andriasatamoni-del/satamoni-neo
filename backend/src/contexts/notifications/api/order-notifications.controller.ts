import { Controller, Get, Inject, ParseIntPipe, DefaultValuePipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { ORDER_NOTIFICATION_STORE, type OrderNotificationStorePort } from "../domain/ports/order-notification-store.port";
import { SMS_GATEWAY, type SmsGatewayPort } from "../domain/ports/sms-gateway.port";
import { publicAppUrl } from "../application/order-notifications.service";

@Controller("order-notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderNotificationsController {
  constructor(
    @Inject(ORDER_NOTIFICATION_STORE) private readonly store: OrderNotificationStorePort,
    @Inject(SMS_GATEWAY) private readonly sms: SmsGatewayPort
  ) {}

  // سجل آخر الرسايل (نجحت/فشلت/مفيش بوابة) + هل البوابة متظبطة أصلًا - للمراجعة من شاشة الإعدادات
  @Get()
  @RequirePermission("pos_settings.view", "pos_settings.manage")
  async recent(@Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return {
      gatewayConfigured: this.sms.isConfigured(),
      ratingLinkBaseUrl: publicAppUrl(),
      notifications: await this.store.listRecent(Math.min(Math.max(limit, 1), 200)),
    };
  }
}
