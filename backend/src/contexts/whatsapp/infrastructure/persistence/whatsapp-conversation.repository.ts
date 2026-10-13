import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { WhatsappConversation, type ConversationChannel } from "../../domain/whatsapp-conversation.aggregate";
import type { WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { whatsappConversations } from "./whatsapp.tables";

@Injectable()
export class WhatsappConversationRepository implements WhatsappConversationRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(conversation: WhatsappConversation): Promise<void> {
    await this.db
      .insert(whatsappConversations)
      .values({
        id: conversation.id,
        channel: conversation.channel,
        phone: conversation.phone,
        customer_name: conversation.customerName,
        last_message_at: conversation.lastMessageAt,
        created_at: conversation.createdAt,
      })
      .onConflictDoUpdate({
        target: whatsappConversations.id,
        set: { customer_name: conversation.customerName, last_message_at: conversation.lastMessageAt },
      });
  }

  async findById(id: string): Promise<WhatsappConversation | null> {
    const [row] = await this.db.select().from(whatsappConversations).where(eq(whatsappConversations.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByChannelAndPhone(channel: ConversationChannel, phone: string): Promise<WhatsappConversation | null> {
    const [row] = await this.db
      .select()
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.channel, channel), eq(whatsappConversations.phone, phone)))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<WhatsappConversation[]> {
    const rows = await this.db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.last_message_at));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof whatsappConversations.$inferSelect): WhatsappConversation {
    return WhatsappConversation.reconstitute(row.id, {
      channel: row.channel as ConversationChannel,
      phone: row.phone,
      customerName: row.customer_name,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
    });
  }
}
