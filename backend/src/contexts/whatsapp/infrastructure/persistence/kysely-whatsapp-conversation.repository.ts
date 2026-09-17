import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import type { WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import type { WhatsappConversationsTable } from "./whatsapp.schema";

@Injectable()
export class KyselyWhatsappConversationRepository implements WhatsappConversationRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(conversation: WhatsappConversation): Promise<void> {
    await this.db
      .insertInto("whatsapp_conversations")
      .values({
        id: conversation.id,
        phone: conversation.phone,
        customer_name: conversation.customerName,
        last_message_at: conversation.lastMessageAt,
        created_at: conversation.createdAt,
      })
      .onConflict((oc) => oc.column("id").doUpdateSet({ customer_name: conversation.customerName, last_message_at: conversation.lastMessageAt }))
      .execute();
  }

  async findById(id: string): Promise<WhatsappConversation | null> {
    const row = await this.db.selectFrom("whatsapp_conversations").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByPhone(phone: string): Promise<WhatsappConversation | null> {
    const row = await this.db.selectFrom("whatsapp_conversations").selectAll().where("phone", "=", phone).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<WhatsappConversation[]> {
    const rows = await this.db.selectFrom("whatsapp_conversations").selectAll().orderBy("last_message_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<WhatsappConversationsTable>): WhatsappConversation {
    return WhatsappConversation.reconstitute(row.id, {
      phone: row.phone,
      customerName: row.customer_name,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
    });
  }
}
