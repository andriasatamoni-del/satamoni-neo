import { Body, Controller, Get, Param, Post, UseFilters, UseGuards, Req } from "@nestjs/common";
import type { Request } from "express";
import { SendWhatsappReplyHandler } from "../application/commands/send-whatsapp-reply.handler";
import { RegisterPendingOrderHandler } from "../application/commands/register-pending-order.handler";
import { ConfirmPendingOrderHandler } from "../application/commands/confirm-pending-order.handler";
import { RejectPendingOrderHandler } from "../application/commands/reject-pending-order.handler";
import { RegisterComplaintFromConversationHandler } from "../application/commands/register-complaint-from-conversation.handler";
import { ListConversationsHandler } from "../application/queries/list-conversations.handler";
import { GetConversationHandler } from "../application/queries/get-conversation.handler";
import { ListPendingOrdersHandler } from "../application/queries/list-pending-orders.handler";
import { SendReplyDto } from "./dto/send-reply.dto";
import { RegisterPendingOrderDto } from "./dto/register-pending-order.dto";
import { ConfirmPendingOrderDto } from "./dto/confirm-pending-order.dto";
import { RejectPendingOrderDto } from "./dto/reject-pending-order.dto";
import { RegisterComplaintFromConversationDto } from "./dto/register-complaint-from-conversation.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { WhatsappDomainErrorFilter } from "./filters/domain-error.filter";
import type { WhatsappConversation } from "../domain/whatsapp-conversation.aggregate";
import type { WhatsappMessageRecord } from "../domain/ports/whatsapp-message.port";
import type { WhatsappPendingOrder } from "../domain/whatsapp-pending-order.aggregate";

@Controller("whatsapp")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(WhatsappDomainErrorFilter)
export class WhatsappController {
  constructor(
    private readonly sendReply: SendWhatsappReplyHandler,
    private readonly registerPendingOrder: RegisterPendingOrderHandler,
    private readonly confirmPendingOrder: ConfirmPendingOrderHandler,
    private readonly rejectPendingOrder: RejectPendingOrderHandler,
    private readonly registerComplaintFromConversation: RegisterComplaintFromConversationHandler,
    private readonly listConversations: ListConversationsHandler,
    private readonly getConversation: GetConversationHandler,
    private readonly listPendingOrders: ListPendingOrdersHandler
  ) {}

  @Get("conversations")
  @RequirePermission("whatsapp.view")
  async conversations() {
    return (await this.listConversations.execute()).map(toPublicConversation);
  }

  @Get("conversations/:id")
  @RequirePermission("whatsapp.view")
  async conversationDetail(@Param("id") id: string) {
    const { conversation, messages } = await this.getConversation.execute(id);
    return { conversation: toPublicConversation(conversation), messages: messages.map(toPublicMessage) };
  }

  @Post("conversations/:id/reply")
  @RequirePermission("whatsapp.reply")
  async reply(@Param("id") id: string, @Body() dto: SendReplyDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicMessage(await this.sendReply.execute({ conversationId: id, body: dto.body, sentBy: req.user.id }));
  }

  @Post("conversations/:id/pending-orders")
  @RequirePermission("whatsapp.orders.manage")
  async createPendingOrder(@Param("id") id: string, @Body() dto: RegisterPendingOrderDto) {
    return toPublicPendingOrder(
      await this.registerPendingOrder.execute({ conversationId: id, orderType: dto.orderType, branchId: dto.branchId, addressDetails: dto.addressDetails, items: dto.items })
    );
  }

  @Get("pending-orders")
  @RequirePermission("whatsapp.orders.manage")
  async pendingOrders() {
    return (await this.listPendingOrders.execute()).map(toPublicPendingOrder);
  }

  @Post("pending-orders/:id/confirm")
  @RequirePermission("whatsapp.orders.manage")
  async confirm(@Param("id") id: string, @Body() dto: ConfirmPendingOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPendingOrder(
      await this.confirmPendingOrder.execute({ pendingOrderId: id, paymentMethodId: dto.paymentMethodId, reviewedBy: req.user.id })
    );
  }

  @Post("pending-orders/:id/reject")
  @RequirePermission("whatsapp.orders.manage")
  async reject(@Param("id") id: string, @Body() dto: RejectPendingOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPendingOrder(await this.rejectPendingOrder.execute({ pendingOrderId: id, reason: dto.reason, reviewedBy: req.user.id }));
  }

  @Post("conversations/:id/complaints")
  @RequirePermission("whatsapp.complaints.create")
  async createComplaint(@Param("id") id: string, @Body() dto: RegisterComplaintFromConversationDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const complaint = await this.registerComplaintFromConversation.execute({
      conversationId: id,
      category: dto.category,
      description: dto.description,
      branchId: dto.branchId,
      createdBy: req.user.id,
    });
    return { id: complaint.id, channel: complaint.channel, category: complaint.category, status: complaint.status };
  }
}

function toPublicConversation(conversation: WhatsappConversation) {
  return {
    id: conversation.id,
    phone: conversation.phone,
    customerName: conversation.customerName,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
  };
}

function toPublicMessage(message: WhatsappMessageRecord) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    body: message.body,
    createdAt: message.createdAt,
  };
}

function toPublicPendingOrder(order: WhatsappPendingOrder) {
  return {
    id: order.id,
    conversationId: order.conversationId,
    customerPhone: order.customerPhone,
    customerName: order.customerName,
    orderType: order.orderType,
    branchId: order.branchId,
    addressDetails: order.addressDetails,
    lines: order.lines.map((l) => ({ variantId: l.variantId, itemName: l.itemName, quantity: l.quantity, unitPrice: l.unitPrice })),
    total: order.total,
    status: order.status,
    rejectionReason: order.rejectionReason,
    confirmedOrderId: order.confirmedOrderId,
    createdAt: order.createdAt,
  };
}
