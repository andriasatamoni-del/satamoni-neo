import { Inject, Injectable } from "@nestjs/common";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { WhatsappConversationNotFoundError } from "../../domain/errors";
import { RegisterComplaintHandler } from "../../../crm/application/commands/register-complaint.handler";
import type { Complaint } from "../../../crm/domain/complaint.aggregate";

export interface RegisterComplaintFromConversationCommand {
  conversationId: string;
  category: string;
  description?: string | null;
  branchId?: string | null;
  createdBy?: string | null;
}

// بيحوّل محادثة واتساب لشكوى حقيقية في CRM (channel="whatsapp") - نفس Complaint aggregate الموحّد،
// مفيش whatsapp_complaints منفصل (راجع تعليق migration 023_create_whatsapp_intake_tables.ts)
@Injectable()
export class RegisterComplaintFromConversationHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    private readonly registerComplaint: RegisterComplaintHandler
  ) {}

  async execute(command: RegisterComplaintFromConversationCommand): Promise<Complaint> {
    const conversation = await this.conversations.findById(command.conversationId);
    if (!conversation) throw new WhatsappConversationNotFoundError();

    return this.registerComplaint.execute({
      channel: "whatsapp",
      customerPhone: conversation.phone,
      category: command.category,
      description: command.description,
      branchId: command.branchId,
      createdBy: command.createdBy,
    });
  }
}
