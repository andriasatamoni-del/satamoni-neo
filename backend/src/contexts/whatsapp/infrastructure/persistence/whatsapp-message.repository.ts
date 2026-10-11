import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { RecordWhatsappMessageInput, WhatsappMessagePort, WhatsappMessageRecord } from "../../domain/ports/whatsapp-message.port";
import { whatsappMessages } from "./whatsapp.tables";

function toRecord(row: typeof whatsappMessages.$inferSelect): WhatsappMessageRecord {
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

@Injectable()
export class WhatsappMessageRepository implements WhatsappMessagePort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(input: RecordWhatsappMessageInput): Promise<WhatsappMessageRecord> {
    const [row] = await this.db
      .insert(whatsappMessages)
      .values({
        id: randomUUID(),
        conversation_id: input.conversationId,
        direction: input.direction,
        body: input.body,
        wa_message_id: input.waMessageId ?? null,
        sent_by: input.sentBy ?? null,
      })
      .returning();
    return toRecord(row);
  }

  async existsByWaMessageId(waMessageId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.wa_message_id, waMessageId))
      .limit(1);
    return Boolean(row);
  }

  async listRecentByConversation(conversationId: string, limit: number): Promise<WhatsappMessageRecord[]> {
    const rows = await this.db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversation_id, conversationId))
      .orderBy(desc(whatsappMessages.created_at))
      .limit(limit);
    return rows.reverse().map(toRecord);
  }

  async listByConversation(conversationId: string): Promise<WhatsappMessageRecord[]> {
    const rows = await this.db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversation_id, conversationId))
      .orderBy(asc(whatsappMessages.created_at));
    return rows.map(toRecord);
  }
}
