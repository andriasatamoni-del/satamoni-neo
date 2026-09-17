import { Inject, Injectable } from "@nestjs/common";
import { WhatsappPendingOrder } from "../../domain/whatsapp-pending-order.aggregate";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";
import { WhatsappPendingOrderNotFoundError } from "../../domain/errors";
import { RegisterOrderHandler } from "../../../orders/application/commands/register-order.handler";

export interface ConfirmPendingOrderCommand {
  pendingOrderId: string;
  paymentMethodId?: string | null;
  reviewedBy: string | null;
}

// بيسجّل الطلب الحقيقي بنفس RegisterOrderHandler اللي POST /orders العادي بيستخدمه بالظبط (استهلاك
// مخزون + حدث OrderRegistered لترحيل قيد المحاسبة تلقائيًا) - مفيش أي منطق مخزون/محاسبة مكرر هنا، نفس
// القرار الموثّق في تعليق migration 023_create_whatsapp_intake_tables.ts
@Injectable()
export class ConfirmPendingOrderHandler {
  constructor(
    @Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort,
    private readonly registerOrder: RegisterOrderHandler
  ) {}

  async execute(command: ConfirmPendingOrderCommand): Promise<WhatsappPendingOrder> {
    const pendingOrder = await this.pendingOrders.findById(command.pendingOrderId);
    if (!pendingOrder) throw new WhatsappPendingOrderNotFoundError();

    const order = await this.registerOrder.execute({
      branchId: pendingOrder.branchId,
      orderType: pendingOrder.orderType,
      customerName: pendingOrder.customerName,
      customerPhone: pendingOrder.customerPhone,
      addressDetails: pendingOrder.addressDetails,
      items: pendingOrder.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      createdBy: command.reviewedBy,
      paymentMethodId: command.paymentMethodId,
    });

    pendingOrder.confirm({ confirmedOrderId: order.id, reviewedBy: command.reviewedBy });
    await this.pendingOrders.save(pendingOrder);
    return pendingOrder;
  }
}
