import { Inject, Injectable } from "@nestjs/common";
import { WhatsappPendingOrder } from "../../domain/whatsapp-pending-order.aggregate";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { WhatsappConversationNotFoundError, VariantNotFoundForPendingOrderError } from "../../domain/errors";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";

export interface RegisterPendingOrderCommand {
  conversationId: string;
  orderType: string;
  branchId: string;
  addressDetails?: string | null;
  items: { variantId: string; quantity: number }[];
}

// نفس فلسفة إنشاء أوردر عادي: أسعار الأصناف بتتقرا حية من قائمة الطعام الحقيقية (مش بتتكتب يدوي) - لو
// الموظف كتب variantId غلط بيرمي خطأ فورًا بدل ما يسجّل طلب بسعر غلط. مفيش استهلاك مخزون هنا خالص -
// ده بيحصل بس لما الطلب يتأكّد فعليًا (ConfirmPendingOrderHandler بينده RegisterOrderHandler الحقيقي)
@Injectable()
export class RegisterPendingOrderHandler {
  constructor(
    @Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort,
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort
  ) {}

  async execute(command: RegisterPendingOrderCommand): Promise<WhatsappPendingOrder> {
    const conversation = await this.conversations.findById(command.conversationId);
    if (!conversation) throw new WhatsappConversationNotFoundError();

    const lines = [];
    for (const item of command.items) {
      const menuItem = await this.menuItems.findByVariantId(item.variantId);
      const variant = menuItem?.variants.find((v) => v.id === item.variantId);
      if (!menuItem || !variant) throw new VariantNotFoundForPendingOrderError();
      lines.push({ variantId: item.variantId, itemName: `${menuItem.name} - ${variant.label}`, quantity: item.quantity, unitPrice: variant.price });
    }

    const pendingOrder = WhatsappPendingOrder.register({
      conversationId: conversation.id,
      customerPhone: conversation.phone,
      customerName: conversation.customerName,
      orderType: command.orderType,
      branchId: command.branchId,
      addressDetails: command.addressDetails,
      lines,
    });
    await this.pendingOrders.save(pendingOrder);
    return pendingOrder;
  }
}
