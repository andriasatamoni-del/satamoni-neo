import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { TalabatWebhookEventRepositoryPort } from "../../domain/ports/talabat-webhook-event-repository.port";

@Injectable()
export class KyselyTalabatWebhookEventRepository implements TalabatWebhookEventRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async recordIfNew(dedupeKey: string, rawBody: unknown): Promise<boolean> {
    const result = await this.db
      .insertInto("talabat_webhook_events")
      .values({ id: randomUUID(), dedupe_key: dedupeKey, raw_body: JSON.stringify(rawBody) })
      .onConflict((oc) => oc.column("dedupe_key").doNothing())
      .executeTakeFirst();
    return result.numInsertedOrUpdatedRows === 1n;
  }
}
