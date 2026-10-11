import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { ImageStorePort } from "../../domain/ports/image-store.port";
import type { ImageMime } from "../../domain/image-format";
import { mediaImages } from "./media.tables";

// الصور جوه Postgres نفسها (bytea): Render مالوش قرص دائم، ومفيش خدمة تخزين خارجية نعتمد عليها. الصور
// بتتصغّر في المتصفح قبل الرفع (أقصى عرض 1000px) فحجمها صغير، والنسخ الاحتياطي اليومي بيشملها تلقائيًا
@Injectable()
export class ImageStore implements ImageStorePort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(input: { mime: ImageMime; content: Buffer; uploadedBy: string | null }): Promise<string> {
    const [row] = await this.db
      .insert(mediaImages)
      .values({ mime: input.mime, content: input.content, size_bytes: input.content.length, uploaded_by: input.uploadedBy })
      .returning({ id: mediaImages.id });
    return row.id;
  }

  async find(id: string): Promise<{ mime: string; content: Buffer } | null> {
    const [row] = await this.db
      .select({ mime: mediaImages.mime, content: mediaImages.content })
      .from(mediaImages)
      .where(eq(mediaImages.id, id))
      .limit(1);
    return row ?? null;
  }
}
