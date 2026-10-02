import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { ImageStorePort } from "../../domain/ports/image-store.port";
import type { ImageMime } from "../../domain/image-format";

// الصور جوه Postgres نفسها (bytea): Render مالوش قرص دائم، ومفيش خدمة تخزين خارجية نعتمد عليها. الصور
// بتتصغّر في المتصفح قبل الرفع (أقصى عرض 1000px) فحجمها صغير، والنسخ الاحتياطي اليومي بيشملها تلقائيًا
@Injectable()
export class KyselyImageStore implements ImageStorePort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(input: { mime: ImageMime; content: Buffer; uploadedBy: string | null }): Promise<string> {
    const row = await this.db
      .insertInto("media_images")
      .values({ mime: input.mime, content: input.content, size_bytes: input.content.length, uploaded_by: input.uploadedBy })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async find(id: string): Promise<{ mime: string; content: Buffer } | null> {
    const row = await this.db.selectFrom("media_images").select(["mime", "content"]).where("id", "=", id).executeTakeFirst();
    return row ?? null;
  }
}
