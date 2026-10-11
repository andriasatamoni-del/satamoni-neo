import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { TalabatWebhookEventRepositoryPort } from "../../domain/ports/talabat-webhook-event-repository.port";
import { talabatWebhookEvents } from "./talabat.tables";

@Injectable()
export class TalabatWebhookEventRepository implements TalabatWebhookEventRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // raw_body is jsonb: Drizzle serialises it. A row comes back only when the event was new.
  async recordIfNew(dedupeKey: string, rawBody: unknown): Promise<boolean> {
    const inserted = await this.db
      .insert(talabatWebhookEvents)
      .values({ id: randomUUID(), dedupe_key: dedupeKey, raw_body: rawBody })
      .onConflictDoNothing({ target: talabatWebhookEvents.dedupe_key })
      .returning({ id: talabatWebhookEvents.id });
    return inserted.length === 1;
  }
}
