import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";
import { CrmModule } from "../crm/crm.module";
import { WHATSAPP_CONVERSATION_REPOSITORY } from "./domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT } from "./domain/ports/whatsapp-message.port";
import { WHATSAPP_PENDING_ORDER_REPOSITORY } from "./domain/ports/whatsapp-pending-order-repository.port";
import { KyselyWhatsappConversationRepository } from "./infrastructure/persistence/kysely-whatsapp-conversation.repository";
import { KyselyWhatsappMessageRepository } from "./infrastructure/persistence/kysely-whatsapp-message.repository";
import { KyselyWhatsappPendingOrderRepository } from "./infrastructure/persistence/kysely-whatsapp-pending-order.repository";
import { ReceiveWhatsappMessageHandler } from "./application/commands/receive-whatsapp-message.handler";
import { SendWhatsappReplyHandler } from "./application/commands/send-whatsapp-reply.handler";
import { RegisterPendingOrderHandler } from "./application/commands/register-pending-order.handler";
import { ConfirmPendingOrderHandler } from "./application/commands/confirm-pending-order.handler";
import { RejectPendingOrderHandler } from "./application/commands/reject-pending-order.handler";
import { RegisterComplaintFromConversationHandler } from "./application/commands/register-complaint-from-conversation.handler";
import { ListConversationsHandler } from "./application/queries/list-conversations.handler";
import { GetConversationHandler } from "./application/queries/get-conversation.handler";
import { ListPendingOrdersHandler } from "./application/queries/list-pending-orders.handler";
import { WhatsappWebhookController } from "./api/whatsapp-webhook.controller";
import { WhatsappController } from "./api/whatsapp.controller";

@Module({
  imports: [IdentityAccessModule, CatalogModule, OrdersModule, CrmModule],
  controllers: [WhatsappWebhookController, WhatsappController],
  providers: [
    { provide: WHATSAPP_CONVERSATION_REPOSITORY, useClass: KyselyWhatsappConversationRepository },
    { provide: WHATSAPP_MESSAGE_PORT, useClass: KyselyWhatsappMessageRepository },
    { provide: WHATSAPP_PENDING_ORDER_REPOSITORY, useClass: KyselyWhatsappPendingOrderRepository },
    ReceiveWhatsappMessageHandler,
    SendWhatsappReplyHandler,
    RegisterPendingOrderHandler,
    ConfirmPendingOrderHandler,
    RejectPendingOrderHandler,
    RegisterComplaintFromConversationHandler,
    ListConversationsHandler,
    GetConversationHandler,
    ListPendingOrdersHandler,
  ],
})
export class WhatsappModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "whatsapp",
      groupLabel: "بوابة استقبال واتساب",
      permissions: [
        { key: "whatsapp.view", label: "رؤية محادثات واتساب" },
        { key: "whatsapp.reply", label: "الرد على محادثة واتساب" },
        { key: "whatsapp.orders.manage", label: "مراجعة/تسجيل طلبات واتساب المعلّقة" },
        { key: "whatsapp.complaints.create", label: "تسجيل شكوى من محادثة واتساب" },
      ],
    });
    // نفس شاشة "طلبات وشكاوى واتساب" في الريبو القديم - كول سنتر هو المسؤول الأساسي عن المراجعة
    this.permissions.setRoleDefaults("callcenter", [
      "whatsapp.view",
      "whatsapp.reply",
      "whatsapp.orders.manage",
      "whatsapp.complaints.create",
    ]);
    this.permissions.setRoleDefaults("branch_manager", ["whatsapp.view", "whatsapp.orders.manage"]);
  }
}
