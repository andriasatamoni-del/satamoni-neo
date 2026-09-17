import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { RecordWhatsappMessageInput, WhatsappMessagePort, WhatsappMessageRecord } from "../../domain/ports/whatsapp-message.port";

@Injectable()
export class KyselyWhatsappMessageRepository implements WhatsappMessagePort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async record(input: RecordWhatsappMessageInput): Promise<WhatsappMessageRecord> {
    const row = await this.db
      .insertInto("whatsapp_messages")
      .values({
        id: randomUUID(),
        conversation_id: input.conversationId,
        direction: input.direction,
        body: input.body,
        wa_message_id: input.waMessageId ?? null,
        sent_by: input.sentBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction as "in" | "out",
      body: row.body,
      waMessageId: row.wa_message_id,
      sentBy: row.sent_by,
      createdAt: row.created_at,
    };
  }

  async listByConversation(conversationId: string): Promise<WhatsappMessageRecord[]> {
    const rows = await this.db
      .selectFrom("whatsapp_messages")
      .selectAll()
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction as "in" | "out",
      body: row.body,
      waMessageId: row.wa_message_id,
      sentBy: row.sent_by,
      createdAt: row.created_at,
    }));
  }
}
