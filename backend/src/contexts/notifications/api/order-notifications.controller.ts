import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { ORDER_NOTIFICATION_STORE, type OrderNotificationStorePort } from "../domain/ports/order-notification-store.port";
import { SMS_GATEWAY, type SmsGatewayPort } from "../domain/ports/sms-gateway.port";
import { publicAppUrl } from "../application/order-notifications.service";
import { PERMISSION } from "../../identity-access/domain/permission";
import { ListQueryDto, pageRequestOf } from "../../../shared/http/list-query.dto";

@Controller("order-notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderNotificationsController {
  constructor(
    @Inject(ORDER_NOTIFICATION_STORE) private readonly store: OrderNotificationStorePort,
    @Inject(SMS_GATEWAY) private readonly sms: SmsGatewayPort
  ) {}

  // سجل آخر الرسايل (نجحت/فشلت/مفيش بوابة) + هل البوابة متظبطة أصلًا - للمراجعة من شاشة الإعدادات
  @Get()
  @RequirePermission(PERMISSION.POS_SETTINGS_VIEW, PERMISSION.POS_SETTINGS_MANAGE)
  async recent(@Query() query: ListQueryDto) {
    const page = pageRequestOf({ ...query, paginate: true })!;
    const { rows, total } = await this.store.listRecent(page);
    return {
      gatewayConfigured: this.sms.isConfigured(),
      ratingLinkBaseUrl: publicAppUrl(),
      notifications: rows,
      total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
